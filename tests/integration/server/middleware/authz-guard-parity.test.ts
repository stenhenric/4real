import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';

import { getAuthCookieName } from '../../../../server/config/cookies.ts';
import {
  authenticateToken,
  requireAdmin,
  requireMfaStepUp,
  requireVerifiedAccount,
} from '../../../../server/middleware/auth.middleware.ts';
import { errorHandler } from '../../../../server/middleware/error.middleware.ts';
import { getWithdrawalStatusHandler } from '../../../../server/controllers/transaction.controller.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { AuthMfaService } from '../../../../server/services/auth-mfa.service.ts';
import { AuthSessionService } from '../../../../server/services/auth-session.service.ts';
import { unauthorized } from '../../../../server/utils/http-error.ts';
import type { AuthenticatedPrincipalDTO } from '../../../../server/types/api.ts';

function principal(overrides: Partial<AuthenticatedPrincipalDTO> = {}): AuthenticatedPrincipalDTO {
  return {
    id: 'user-1',
    sessionId: 'session-user',
    deviceId: 'device-user',
    isAdmin: false,
    emailVerified: true,
    usernameComplete: true,
    mfaEnabled: true,
    ...overrides,
  };
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function startParityApp(t: TestContext, params: {
  principals: Record<string, AuthenticatedPrincipalDTO>;
  freshStepUpSessions?: string[];
}) {
  const freshStepUpSessions = new Set(params.freshStepUpSessions ?? []);
  t.mock.method(AuthSessionService, 'validateAccessToken', async (token: string) => {
    const mappedPrincipal = params.principals[token];
    if (!mappedPrincipal) {
      throw unauthorized('Invalid token', 'INVALID_TOKEN');
    }

    return {
      principal: mappedPrincipal,
      sessionDocument: {},
    } as unknown as Awaited<ReturnType<typeof AuthSessionService.validateAccessToken>>;
  });
  t.mock.method(AuthSessionService, 'getMfaStepUpExpiry', async (sessionId: string) => (
    freshStepUpSessions.has(sessionId) ? new Date(Date.now() + 60_000) : null
  ));
  t.mock.method(AuthMfaService, 'createChallenge', async () => 'challenge-step-up');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get(
    '/api/admin/merchant/config',
    authenticateToken,
    requireVerifiedAccount,
    requireAdmin,
    requireMfaStepUp,
    (_req, res) => res.json({ ok: true, route: 'admin-merchant-config' }),
  );
  app.patch(
    '/api/orders/:id',
    authenticateToken,
    requireVerifiedAccount,
    requireAdmin,
    requireMfaStepUp,
    (_req, res) => res.json({ ok: true, route: 'order-status' }),
  );
  app.post(
    '/api/transactions/withdraw',
    authenticateToken,
    requireVerifiedAccount,
    requireMfaStepUp,
    (_req, res) => res.status(202).json({ ok: true, route: 'withdraw' }),
  );
  app.get(
    '/api/transactions/withdrawals/:withdrawalId',
    authenticateToken,
    requireVerifiedAccount,
    asyncRoute(getWithdrawalStatusHandler as RequestHandler),
  );
  app.use(errorHandler);

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

function authHeaders(token: string) {
  return {
    Cookie: `${getAuthCookieName()}=${token}`,
  };
}

async function parseJson(response: Response) {
  return response.json() as Promise<{ code?: string; ok?: boolean; route?: string }>;
}

test('production-parity sensitive routes reject unauthenticated requests', async (t) => {
  const baseUrl = await startParityApp(t, { principals: {} });
  const response = await fetch(`${baseUrl}/api/admin/merchant/config`);

  assert.equal(response.status, 401);
  assert.equal((await parseJson(response)).code, 'UNAUTHENTICATED');
});

test('production-parity sensitive routes reject unverified users before role checks', async (t) => {
  const baseUrl = await startParityApp(t, {
    principals: {
      unverified: principal({
        sessionId: 'session-unverified',
        emailVerified: false,
        isAdmin: true,
      }),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/merchant/config`, {
    headers: authHeaders('unverified'),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('production-parity admin routes reject non-admin users', async (t) => {
  const baseUrl = await startParityApp(t, {
    principals: {
      user: principal(),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/merchant/config`, {
    headers: authHeaders('user'),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'ADMIN_ACCESS_REQUIRED');
});

test('production-parity admin routes reject admins without fresh MFA step-up', async (t) => {
  const baseUrl = await startParityApp(t, {
    principals: {
      admin: principal({
        id: 'admin-1',
        sessionId: 'session-admin',
        isAdmin: true,
      }),
    },
  });

  const response = await fetch(`${baseUrl}/api/admin/merchant/config`, {
    headers: authHeaders('admin'),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'MFA_REQUIRED');
});

test('production-parity admin and merchant-sensitive routes accept authorized admins with fresh MFA step-up', async (t) => {
  const baseUrl = await startParityApp(t, {
    principals: {
      admin: principal({
        id: 'admin-1',
        sessionId: 'session-admin',
        isAdmin: true,
      }),
    },
    freshStepUpSessions: ['session-admin'],
  });

  const adminResponse = await fetch(`${baseUrl}/api/admin/merchant/config`, {
    headers: authHeaders('admin'),
  });
  const orderResponse = await fetch(`${baseUrl}/api/orders/order-1`, {
    method: 'PATCH',
    headers: {
      ...authHeaders('admin'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'paid' }),
  });

  assert.equal(adminResponse.status, 200);
  assert.deepEqual(await parseJson(adminResponse), { ok: true, route: 'admin-merchant-config' });
  assert.equal(orderResponse.status, 200);
  assert.deepEqual(await parseJson(orderResponse), { ok: true, route: 'order-status' });
});

test('production-parity withdrawal route requires MFA step-up for normal users', async (t) => {
  const baseUrl = await startParityApp(t, {
    principals: {
      user: principal(),
    },
  });

  const response = await fetch(`${baseUrl}/api/transactions/withdraw`, {
    method: 'POST',
    headers: {
      ...authHeaders('user'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'MFA_REQUIRED');
});

test('withdrawal status lookup is scoped to the authenticated user', async (t) => {
  const lookupMock = t.mock.method(WithdrawalRepository, 'findByWithdrawalIdForUser', async () => null);
  const baseUrl = await startParityApp(t, {
    principals: {
      user: principal({
        id: 'user-1',
        sessionId: 'session-user',
      }),
    },
  });

  const response = await fetch(`${baseUrl}/api/transactions/withdrawals/withdrawal-for-user-2`, {
    headers: authHeaders('user'),
  });

  assert.equal(response.status, 404);
  assert.equal((await parseJson(response)).code, 'WITHDRAWAL_NOT_FOUND');
  assert.equal(lookupMock.mock.callCount(), 1);
  assert.deepEqual(lookupMock.mock.calls[0]?.arguments, ['withdrawal-for-user-2', 'user-1']);
});
