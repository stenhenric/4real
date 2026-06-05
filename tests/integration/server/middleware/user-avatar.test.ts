import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';

import { getAuthCookieName } from '../../../../server/config/cookies.ts';
import { errorHandler } from '../../../../server/middleware/error.middleware.ts';
import { AuthSessionService } from '../../../../server/services/auth-session.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';
import usersRoutes from '../../../../server/routes/users.routes.ts';
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
    mfaEnabled: false,
    ...overrides,
  };
}

async function startUserAvatarApp(t: TestContext, params: {
  principals: Record<string, AuthenticatedPrincipalDTO>;
}) {
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

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/users', usersRoutes);
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
    'Content-Type': 'application/json',
  };
}

test('avatar metadata update requires authentication', async (t) => {
  const baseUrl = await startUserAvatarApp(t, { principals: {} });

  const response = await fetch(`${baseUrl}/api/users/me/avatar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset: 'pencil-face-01', color: 'ink' }),
  });

  assert.equal(response.status, 401);
});

test('avatar metadata update returns the updated public profile', async (t) => {
  const user = {
    _id: 'user-1',
    username: 'player-one',
    email: 'player@example.com',
    balance: '5.000000',
    elo: 1111,
    isAdmin: false,
    stats: { wins: 2, losses: 1, draws: 0 },
    avatar: { preset: 'pencil-face-05', color: 'violet' },
  };
  t.mock.method(UserService, 'updateAvatarSettings', async (userId: string, avatar: unknown) => {
    assert.equal(userId, 'user-1');
    assert.deepEqual(avatar, { preset: 'pencil-face-05', color: 'violet' });
    return user as any;
  });

  const baseUrl = await startUserAvatarApp(t, {
    principals: { token: principal() },
  });

  const response = await fetch(`${baseUrl}/api/users/me/avatar`, {
    method: 'PATCH',
    headers: authHeaders('token'),
    body: JSON.stringify({ preset: 'pencil-face-05', color: 'violet' }),
  });
  const payload = await response.json() as { avatar?: unknown; balance?: unknown; email?: unknown };

  assert.equal(response.status, 200);
  assert.deepEqual(payload.avatar, { preset: 'pencil-face-05', color: 'violet' });
  assert.equal('balance' in payload, false);
  assert.equal('email' in payload, false);
});
