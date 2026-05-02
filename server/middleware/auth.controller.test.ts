import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';

import {
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '../config/cookies.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { AuthController } from '../controllers/auth.controller.ts';
import { signRefreshToken } from '../services/auth-token.service.ts';
import { UserService } from '../services/user.service.ts';

function registerEnvCleanup(t: TestContext) {
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();

  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetEnvCacheForTests();
  });
}

function createResponseDouble() {
  return {
    locals: {},
    cookies: [] as Array<{ name: string; value: string; options: unknown }>,
    clearedCookies: [] as Array<{ name: string; options: unknown }>,
    statusCode: 200,
    body: undefined as unknown,
    cookie(name: string, value: string, options: unknown) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: unknown) {
      this.clearedCookies.push({ name, options });
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test('AuthController.refreshSession reissues access and refresh cookies from a valid refresh token', async (t) => {
  registerEnvCleanup(t);

  const authStateMock = mock.method(UserService, 'getAuthState', async () => ({
    tokenVersion: 4,
    isAdmin: true,
  }));
  const findByIdMock = mock.method(UserService, 'findById', async () => ({
    _id: { toString: () => 'user-1' },
    username: 'alice',
    email: 'alice@example.com',
    elo: 1200,
    isAdmin: true,
    stats: { wins: 1, losses: 2, draws: 3 },
  } as any));
  const balanceMock = mock.method(UserService, 'getDisplayBalance', async () => 42);

  t.after(() => authStateMock.mock.restore());
  t.after(() => findByIdMock.mock.restore());
  t.after(() => balanceMock.mock.restore());

  const refreshToken = signRefreshToken({
    id: 'user-1',
    isAdmin: false,
    tokenVersion: 4,
  });
  const req = {
    cookies: {
      [REFRESH_COOKIE_NAME]: refreshToken,
    },
  } as any;
  const res = createResponseDouble();

  await AuthController.refreshSession(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal(res.cookies.length, 2);
  assert.deepEqual(
    res.cookies.map((entry) => entry.name).sort(),
    [AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME].sort(),
  );
  assert.deepEqual(res.body, {
    user: {
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      balance: 42,
      elo: 1200,
      isAdmin: true,
      stats: { wins: 1, losses: 2, draws: 3 },
    },
  });
});

test('AuthController.logout revokes the session from the refresh token when the access token is missing', async (t) => {
  registerEnvCleanup(t);

  const bumpMock = mock.method(UserService, 'bumpTokenVersionIfCurrent', async () => true);
  t.after(() => bumpMock.mock.restore());

  const refreshToken = signRefreshToken({
    id: 'user-2',
    isAdmin: false,
    tokenVersion: 7,
  });
  const req = {
    cookies: {
      [REFRESH_COOKIE_NAME]: refreshToken,
    },
  } as any;
  const res = createResponseDouble();

  await AuthController.logout(req, res as any);

  assert.equal(res.statusCode, 204);
  assert.equal(bumpMock.mock.callCount(), 1);
  assert.deepEqual(bumpMock.mock.calls[0].arguments, ['user-2', 7]);
  assert.deepEqual(
    res.clearedCookies.map((entry) => entry.name).sort(),
    [AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME].sort(),
  );
});
