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
import {
  getWithdrawalStatusHandler,
  requestWithdrawalHandler,
} from '../../../../server/controllers/transaction.controller.ts';
import { validateBody } from '../../../../server/middleware/validate.middleware.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { AuthMfaService } from '../../../../server/services/auth-mfa.service.ts';
import { AuthSessionService } from '../../../../server/services/auth-session.service.ts';
import { WithdrawalIntentService } from '../../../../server/services/withdrawal-intent.service.ts';
import { unauthorized } from '../../../../server/utils/http-error.ts';
import { withdrawRequestSchema } from '../../../../server/validation/request-schemas.ts';
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
    validateBody(withdrawRequestSchema),
    asyncRoute(requestWithdrawalHandler as RequestHandler),
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
  return response.json() as Promise<{
    code?: string;
    details?: Record<string, unknown>;
    ok?: boolean;
    route?: string;
  }>;
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

test('production-parity withdrawal route starts the dedicated withdrawal MFA intent for normal users', async (t) => {
  const createIntentMock = t.mock.method(WithdrawalIntentService, 'createIntent', async () => ({
    withdrawalIntentId: 'withdrawal-intent-1',
    challengeId: 'withdrawal-challenge-1',
  }));
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
      'Idempotency-Key': 'withdraw-idem-1',
    },
    body: JSON.stringify({
      amountUsdt: '5',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    }),
  });

  assert.equal(response.status, 403);
  const body = await parseJson(response);
  assert.equal(body.code, 'MFA_REQUIRED');
  assert.deepEqual(body.details, {
    nextStep: 'withdrawal_mfa',
    challengeId: 'withdrawal-challenge-1',
    withdrawalIntentId: 'withdrawal-intent-1',
    amountUsdt: '5.000000',
    toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  });
  assert.equal(createIntentMock.mock.callCount(), 1);
  assert.deepEqual(createIntentMock.mock.calls[0]?.arguments, [{
    userId: 'user-1',
    toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    amountUsdt: '5.000000',
    idempotencyKey: 'withdraw-idem-1',
  }]);
});

test('production-parity withdrawal route does not let generic step-up bypass withdrawal intent MFA', async (t) => {
  const createIntentMock = t.mock.method(WithdrawalIntentService, 'createIntent', async () => ({
    withdrawalIntentId: 'withdrawal-intent-fresh-stepup',
    challengeId: 'withdrawal-challenge-fresh-stepup',
  }));
  const baseUrl = await startParityApp(t, {
    principals: {
      user: principal(),
    },
    freshStepUpSessions: ['session-user'],
  });

  const response = await fetch(`${baseUrl}/api/transactions/withdraw`, {
    method: 'POST',
    headers: {
      ...authHeaders('user'),
      'Content-Type': 'application/json',
      'Idempotency-Key': 'withdraw-idem-fresh-stepup',
    },
    body: JSON.stringify({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    }),
  });

  assert.equal(response.status, 403);
  const body = await parseJson(response);
  assert.equal(body.code, 'MFA_REQUIRED');
  assert.equal(body.details?.nextStep, 'withdrawal_mfa');
  assert.equal(body.details?.withdrawalIntentId, 'withdrawal-intent-fresh-stepup');
  assert.equal(createIntentMock.mock.callCount(), 1);
});

test('production-parity withdrawal route rejects users without MFA setup before creating an intent', async (t) => {
  const createIntentMock = t.mock.method(WithdrawalIntentService, 'createIntent', async () => {
    throw new Error('createIntent should not run when MFA is not configured');
  });
  const baseUrl = await startParityApp(t, {
    principals: {
      user: principal({
        mfaEnabled: false,
      }),
    },
  });

  const response = await fetch(`${baseUrl}/api/transactions/withdraw`, {
    method: 'POST',
    headers: {
      ...authHeaders('user'),
      'Content-Type': 'application/json',
      'Idempotency-Key': 'withdraw-idem-no-mfa',
    },
    body: JSON.stringify({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    }),
  });

  assert.equal(response.status, 403);
  assert.equal((await parseJson(response)).code, 'MFA_SETUP_REQUIRED');
  assert.equal(createIntentMock.mock.callCount(), 0);
});

test('production-parity withdrawal route requires an idempotency key before creating an intent', async (t) => {
  const createIntentMock = t.mock.method(WithdrawalIntentService, 'createIntent', async () => {
    throw new Error('createIntent should not run without an idempotency key');
  });
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
    body: JSON.stringify({
      amountUsdt: '5.000000',
      toAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    }),
  });

  assert.equal(response.status, 400);
  assert.equal((await parseJson(response)).code, 'MISSING_IDEMPOTENCY_KEY');
  assert.equal(createIntentMock.mock.callCount(), 0);
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
