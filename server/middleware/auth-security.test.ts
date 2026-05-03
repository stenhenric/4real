import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  getAuthCookieName,
  getAuthCookieOptions,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getRefreshCookieName,
  getRefreshCookieOptions,
} from '../config/cookies.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { AuthController } from '../controllers/auth.controller.ts';
import { decodeBase32 } from '../services/auth-crypto.service.ts';
import { AuthSessionService } from '../services/auth-session.service.ts';
import { assertValidPassword } from '../services/password-policy.service.ts';
import { OneTimeTokenService } from '../services/one-time-token.service.ts';
import { createTotpSetup, verifyTotpCode } from '../services/totp.service.ts';
import { UserService } from '../services/user.service.ts';

function createTotpCode(secret: string, timestampMs: number) {
  const secretBytes = decodeBase32(secret);
  const counter = Math.floor(timestampMs / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secretBytes).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const part1 = hmac[offset] ?? 0;
  const part2 = hmac[offset + 1] ?? 0;
  const part3 = hmac[offset + 2] ?? 0;
  const part4 = hmac[offset + 3] ?? 0;
  const binary = ((part1 & 0x7f) << 24)
    | ((part2 & 0xff) << 16)
    | ((part3 & 0xff) << 8)
    | (part4 & 0xff);

  return (binary % 1_000_000).toString().padStart(6, '0');
}

test('createTotpSetup returns a standards-shaped OTP Auth URL', () => {
  const setup = createTotpSetup({
    issuer: '4real',
    accountName: 'alice@example.com',
  });

  const url = new URL(setup.otpauthUrl);

  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.hostname, 'totp');
  assert.equal(url.pathname, '/4real%3Aalice%40example.com');
  assert.equal(url.searchParams.get('issuer'), '4real');
  assert.equal(url.searchParams.get('secret'), setup.secret);
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
});

test('verifyTotpCode accepts the current 6-digit code and rejects malformed codes', () => {
  const now = Date.parse('2026-05-02T12:00:00.000Z');
  const setup = createTotpSetup({
    issuer: '4real',
    accountName: 'alice@example.com',
  });
  const code = createTotpCode(setup.secret, now);

  assert.equal(verifyTotpCode(setup.secret, code, now), true);
  assert.equal(verifyTotpCode(setup.secret, '12345', now), false);
  assert.equal(verifyTotpCode(setup.secret, 'ABCDEF', now), false);
});

test('assertValidPassword rejects common and predictable passwords', () => {
  assert.throws(
    () => assertValidPassword('administrator'),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'PASSWORD_TOO_COMMON',
  );

  assert.throws(
    () => assertValidPassword('alice-should-not-work', { email: 'alice@example.com' }),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'PASSWORD_TOO_PREDICTABLE',
  );

  assert.doesNotThrow(() => {
    assertValidPassword('paper-lobby-stakes-2026', {
      email: 'alice@example.com',
      username: 'alice',
    });
  });
});

test('auth cookie names drop the __Host- prefix outside production and restore it in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'development';
    resetEnvCacheForTests();

    assert.equal(getAuthCookieName(), '4real-at');
    assert.equal(getRefreshCookieName(), '4real-rt');
    assert.equal(getDeviceCookieName(), '4real-did');
    assert.equal(getAuthCookieOptions().secure, false);
    assert.equal(getRefreshCookieOptions().secure, false);
    assert.equal(getDeviceCookieOptions().secure, false);

    process.env.NODE_ENV = 'production';
    resetEnvCacheForTests();

    assert.equal(getAuthCookieName(), '__Host-4real-at');
    assert.equal(getRefreshCookieName(), '__Host-4real-rt');
    assert.equal(getDeviceCookieName(), '__Host-4real-did');
    assert.equal(getAuthCookieOptions().secure, true);
    assert.equal(getRefreshCookieOptions().secure, true);
    assert.equal(getDeviceCookieOptions().secure, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    resetEnvCacheForTests();
  }
});

function createResponseMock() {
  const headers = new Map<string, string>();
  const cookies: Array<{ name: string; value: string; options: unknown }> = [];
  const clearedCookies: Array<{ name: string; options: unknown }> = [];

  return {
    headers,
    cookies,
    clearedCookies,
    statusCode: 200,
    payload: undefined as unknown,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    cookie(name: string, value: string, options: unknown) {
      cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: unknown) {
      clearedCookies.push({ name, options });
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    send(payload?: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function createMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: { toString: () => 'user-1' },
    username: 'alice',
    email: 'alice@example.com',
    elo: 1200,
    isAdmin: false,
    stats: { wins: 3, losses: 1, draws: 0 },
    emailVerifiedAt: new Date('2026-05-03T00:00:00.000Z'),
    mfa: {},
    ...overrides,
  } as any;
}

function createIssuedSession() {
  const createdAt = new Date('2026-05-03T01:00:00.000Z');
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    deviceId: 'device-1',
    session: {
      sessionId: 'session-1',
      userId: { toString: () => 'user-1' },
      deviceId: 'device-1',
      createdAt,
      lastSeenAt: createdAt,
      idleExpiresAt: new Date('2026-05-03T02:00:00.000Z'),
      absoluteExpiresAt: new Date('2026-05-03T03:00:00.000Z'),
      lastUserAgent: 'test-agent',
      lastIp: '127.0.0.1',
    },
  };
}

test('auth consume routes accept POST and do not expose legacy GET session issuers', () => {
  const authRoutesSource = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'auth.routes.ts'),
    'utf8',
  );

  assert.match(authRoutesSource, /router\.post\('\/login\/magic-link\/consume'/);
  assert.match(authRoutesSource, /router\.post\('\/login\/suspicious\/consume'/);
  assert.match(authRoutesSource, /router\.post\('\/email\/verify\/consume'/);
  assert.doesNotMatch(authRoutesSource, /router\.get\('\/login\/magic-link\/consume'/);
  assert.doesNotMatch(authRoutesSource, /router\.get\('\/login\/suspicious\/consume'/);
  assert.doesNotMatch(authRoutesSource, /router\.get\('\/email\/verify\/consume'/);
});

test('consumeMagicLink issues session cookies, no-store headers, and a redirect payload', async (t) => {
  const tokenMock = t.mock.method(OneTimeTokenService, 'consume', async () => ({
    userId: { toString: () => 'user-1' },
    metadata: { redirectTo: '/bank' },
  }) as any);
  const userMock = t.mock.method(UserService, 'findAuthUserById', async () => createMockUser());
  const sessionMock = t.mock.method(AuthSessionService, 'createSession', async () => createIssuedSession() as any);
  const balanceMock = t.mock.method(UserService, 'getDisplayBalance', async () => '125.500000');

  const req = {
    body: { token: 'magic-token' },
    cookies: {},
    ip: '127.0.0.1',
    get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'test-agent' : undefined),
  } as any;
  const res = createResponseMock() as any;

  await AuthController.consumeMagicLink(req, res);

  assert.equal(tokenMock.mock.callCount(), 1);
  assert.equal(userMock.mock.callCount(), 1);
  assert.equal(sessionMock.mock.callCount(), 1);
  assert.equal(balanceMock.mock.callCount(), 1);
  assert.equal(res.getHeader('cache-control'), 'no-store, max-age=0');
  assert.equal(res.getHeader('pragma'), 'no-cache');
  assert.equal(res.getHeader('expires'), '0');
  assert.deepEqual(
    res.cookies.map((entry: { name: string }) => entry.name).sort(),
    [getAuthCookieName(), getDeviceCookieName(), getRefreshCookieName()].sort(),
  );
  assert.equal((res.payload as { redirectTo?: string }).redirectTo, '/bank');
});

test('consumeVerificationEmail issues a session and routes the browser to the verified screen', async (t) => {
  const tokenMock = t.mock.method(OneTimeTokenService, 'consume', async () => ({
    userId: { toString: () => 'user-1' },
  }) as any);
  const userMock = t.mock.method(UserService, 'markEmailVerified', async () => createMockUser());
  const sessionMock = t.mock.method(AuthSessionService, 'createSession', async () => createIssuedSession() as any);
  const balanceMock = t.mock.method(UserService, 'getDisplayBalance', async () => '125.500000');

  const req = {
    body: { token: 'verify-token' },
    cookies: {},
    ip: '127.0.0.1',
    get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'test-agent' : undefined),
  } as any;
  const res = createResponseMock() as any;

  await AuthController.consumeVerificationEmail(req, res);

  assert.equal(tokenMock.mock.callCount(), 1);
  assert.equal(userMock.mock.callCount(), 1);
  assert.equal(sessionMock.mock.callCount(), 1);
  assert.equal(balanceMock.mock.callCount(), 1);
  assert.equal(res.getHeader('cache-control'), 'no-store, max-age=0');
  assert.equal((res.payload as { redirectTo?: string }).redirectTo, '/auth/verified');
});

test('logout clears site data and removes all session cookies', async (t) => {
  const logoutMock = t.mock.method(AuthSessionService, 'logoutFromTokens', async () => undefined);
  const req = {
    cookies: {
      [getAuthCookieName()]: 'access-token',
      [getRefreshCookieName()]: 'refresh-token',
    },
  } as any;
  const res = createResponseMock() as any;

  await AuthController.logout(req, res);

  assert.equal(logoutMock.mock.callCount(), 1);
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('clear-site-data'), '"cache", "cookies", "storage"');
  assert.deepEqual(
    res.clearedCookies.map((entry: { name: string }) => entry.name).sort(),
    [getAuthCookieName(), getDeviceCookieName(), getRefreshCookieName()].sort(),
  );
});

test('revokeSession clears site data when the current session is revoked', async (t) => {
  const revokeMock = t.mock.method(AuthSessionService, 'revokeSession', async () => undefined);
  const listMock = t.mock.method(AuthSessionService, 'listSessions', async () => []);
  const req = {
    user: {
      id: 'user-1',
      sessionId: 'session-1',
      deviceId: 'device-1',
      isAdmin: false,
      emailVerified: true,
      usernameComplete: true,
      mfaEnabled: false,
    },
    params: {
      sessionId: 'session-1',
    },
  } as any;
  const res = createResponseMock() as any;

  await AuthController.revokeSession(req, res);

  assert.equal(revokeMock.mock.callCount(), 1);
  assert.equal(listMock.mock.callCount(), 1);
  assert.equal(res.getHeader('clear-site-data'), '"cache", "cookies", "storage"');
});
