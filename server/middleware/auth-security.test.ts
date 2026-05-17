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
import { requireMfaStepUpIfEnabled } from '../middleware/auth.middleware.ts';
import { decodeBase32, encryptSecret, hashOpaqueToken } from '../services/auth-crypto.service.ts';
import { AuthEmailService } from '../services/auth-email.service.ts';
import { AuthMfaService } from '../services/auth-mfa.service.ts';
import { AuthSessionService } from '../services/auth-session.service.ts';
import { AuditService } from '../services/audit.service.ts';
import { GoogleOAuthService } from '../services/google-oauth.service.ts';
import { assertValidPassword } from '../services/password-policy.service.ts';
import { OneTimeTokenService } from '../services/one-time-token.service.ts';
import { hashPassword } from '../services/password-hash.service.ts';
import { verifyTurnstileToken } from '../services/auth-turnstile.service.ts';
import { createTotpSetup, verifyTotpCode } from '../services/totp.service.ts';
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
import { UserService } from '../services/user.service.ts';
import { User } from '../models/User.ts';
import { serviceUnavailable } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';

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

test('verifyUserFactor consumes a recovery code atomically and rejects duplicate redemption', async (t) => {
  const secret = createTotpSetup({ issuer: '4real', accountName: 'alice@example.com' }).secret;
  const enabledAt = new Date('2026-05-03T00:00:00.000Z');
  const recoveryCode = 'ABCD-EFGH';
  const recoveryCodeHash = hashOpaqueToken('ABCD-EFGH');
  const user = createMockUser({
    mfa: {
      enabledAt,
      totpSecretEncrypted: encryptSecret(secret),
      recoveryCodeHashes: [recoveryCodeHash],
    },
  });

  let consumed = false;
  const consumeMock = t.mock.method(UserService, 'consumeMfaRecoveryCode', async (params: {
    userId: string;
    recoveryCodeHash: string;
  }) => {
    assert.equal(params.userId, 'user-1');
    assert.equal(params.recoveryCodeHash, recoveryCodeHash);
    if (consumed) {
      return null;
    }
    consumed = true;
    return createMockUser({
      mfa: {
        enabledAt,
        totpSecretEncrypted: encryptSecret(secret),
        recoveryCodeHashes: [],
      },
    });
  });

  const results = await Promise.allSettled([
    AuthMfaService.verifyUserFactor(user, { code: undefined, recoveryCode }),
    AuthMfaService.verifyUserFactor(user, { code: undefined, recoveryCode }),
  ]);

  assert.equal(consumeMock.mock.callCount(), 2);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(
    rejected?.status === 'rejected'
      && typeof rejected.reason === 'object'
      && rejected.reason !== null
      && 'code' in rejected.reason
      && rejected.reason.code === 'INVALID_TOTP_CODE',
    true,
  );
});

test('verifyUserFactor still accepts a valid TOTP code without consuming recovery codes', async (t) => {
  const now = Date.now();
  const secret = createTotpSetup({ issuer: '4real', accountName: 'alice@example.com' }).secret;
  const user = createMockUser({
    mfa: {
      enabledAt: new Date('2026-05-03T00:00:00.000Z'),
      totpSecretEncrypted: encryptSecret(secret),
      recoveryCodeHashes: [hashOpaqueToken('ABCDEFGH')],
    },
  });
  const consumeMock = t.mock.method(UserService, 'consumeMfaRecoveryCode', async () => {
    throw new Error('recovery code should not be consumed for TOTP');
  });

  const verified = await AuthMfaService.verifyUserFactor(user, {
    code: createTotpCode(secret, now),
    recoveryCode: undefined,
  });

  assert.equal(verified, user);
  assert.equal(consumeMock.mock.callCount(), 0);
});

test('regenerateRecoveryCodes returns one new set and emits audit plus security notification', async (t) => {
  const secret = createTotpSetup({ issuer: '4real', accountName: 'alice@example.com' }).secret;
  const user = createMockUser({
    mfa: {
      enabledAt: new Date('2026-05-03T00:00:00.000Z'),
      totpSecretEncrypted: encryptSecret(secret),
      recoveryCodeHashes: [hashOpaqueToken('OLD-CODE')],
    },
  });

  let storedHashes: string[] = [];
  const updateMock = t.mock.method(UserService, 'updateMfaState', async (params: {
    recoveryCodeHashes: string[];
  }) => {
    storedHashes = params.recoveryCodeHashes;
    return createMockUser({ mfa: { ...user.mfa, recoveryCodeHashes: params.recoveryCodeHashes } });
  });
  const auditMock = t.mock.method(AuditService, 'record', async (params) => {
    assert.equal(params.eventType, 'mfa_recovery_codes_regenerated');
    assert.equal(params.actorUserId, 'user-1');
    assert.equal(params.targetUserId, 'user-1');
  });
  const notificationMock = t.mock.method(
    ProductEmailNotificationService,
    'sendSecurityAlert',
    async (params: { userId: string; subject: string }) => {
      assert.equal(params.userId, 'user-1');
      assert.match(params.subject, /recovery codes/i);
    },
  );

  const recoveryCodes = await AuthMfaService.regenerateRecoveryCodes(user, { actorUserId: 'user-1' });

  assert.equal(recoveryCodes.length, 10);
  assert.equal(new Set(recoveryCodes).size, 10);
  assert.equal(storedHashes.length, 10);
  assert.equal(storedHashes.some((hash) => recoveryCodes.includes(hash)), false);
  assert.equal(updateMock.mock.callCount(), 1);
  assert.equal(auditMock.mock.callCount(), 1);
  assert.equal(notificationMock.mock.callCount(), 1);
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

test('User passwordHash is excluded from default queries by schema policy', () => {
  assert.equal(User.schema.path('passwordHash')?.options?.select, false);
});

test('auth cookie names drop the __Host- prefix outside production and restore it in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  const previousPublicAppOrigin = process.env.PUBLIC_APP_ORIGIN;
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;

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
    process.env.REDIS_URL = 'rediss://redis.example.invalid:6379';
    process.env.PUBLIC_APP_ORIGIN = 'https://app.example.com';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
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

    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }

    if (previousPublicAppOrigin === undefined) {
      delete process.env.PUBLIC_APP_ORIGIN;
    } else {
      process.env.PUBLIC_APP_ORIGIN = previousPublicAppOrigin;
    }

    if (previousAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    }

    resetEnvCacheForTests();
  }
});

test('verifyTurnstileToken fails closed in production when the secret is missing', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousRedisUrl = process.env.REDIS_URL;
  const previousPublicAppOrigin = process.env.PUBLIC_APP_ORIGIN;
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;

  try {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = '';
    process.env.REDIS_URL = 'rediss://redis.example.invalid:6379';
    process.env.PUBLIC_APP_ORIGIN = 'https://app.example.com';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    resetEnvCacheForTests();

    await assert.rejects(
      () => verifyTurnstileToken('token', '127.0.0.1'),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string; statusCode?: number }).code === 'TURNSTILE_NOT_CONFIGURED'
        && (error as { statusCode?: number }).statusCode === 503,
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousTurnstileSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret;
    }

    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }

    if (previousPublicAppOrigin === undefined) {
      delete process.env.PUBLIC_APP_ORIGIN;
    } else {
      process.env.PUBLIC_APP_ORIGIN = previousPublicAppOrigin;
    }

    if (previousAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
    }

    resetEnvCacheForTests();
  }
});

test('verifyTurnstileToken sends Cloudflare verification with a bounded abort signal', async (t) => {
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
  resetEnvCacheForTests();

  try {
    let capturedInit: RequestInit | undefined;
    const fetchMock = t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        async json() {
          return { success: true };
        },
      } as Response;
    });

    await verifyTurnstileToken('token', '127.0.0.1');

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.ok(capturedInit?.signal instanceof AbortSignal);
  } finally {
    if (previousTurnstileSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret;
    }
    resetEnvCacheForTests();
  }
});

test('register with an unverified existing email returns pending_email_verification before username conflicts', async (t) => {
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = '';
  resetEnvCacheForTests();

  try {
    const findByEmailMock = t.mock.method(UserService, 'findByEmail', async () => createMockUser({
      email: 'alice@example.com',
      emailVerifiedAt: null,
    }));
    const findByUsernameMock = t.mock.method(UserService, 'findByUsername', async () => createMockUser({
      _id: { toString: () => 'user-2' },
      username: 'colliding-name',
      email: 'other@example.com',
    }));
    const sendVerificationMock = t.mock.method(
      AuthEmailService,
      'sendVerificationEmail',
      async () => 'http://127.0.0.1:3000/auth/verify-email?token=verify-token',
    );

    const req = {
      body: {
        username: 'new-username',
        email: 'alice@example.com',
        password: 'paper-lobby-stakes-2026',
        turnstileToken: 'token',
      },
      ip: '127.0.0.1',
      cookies: {},
      get: () => undefined,
    } as any;
    const res = createResponseMock() as any;

    await AuthController.register(req, res);

    assert.equal(findByEmailMock.mock.callCount(), 1);
    assert.equal(findByUsernameMock.mock.callCount(), 1);
    assert.equal(sendVerificationMock.mock.callCount(), 1);
    assert.equal(res.statusCode, 202);
    assert.equal((res.payload as { status?: string }).status, 'pending_email_verification');
    assert.equal((res.payload as { email?: string }).email, 'alice@example.com');
  } finally {
    if (previousTurnstileSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret;
    }
    resetEnvCacheForTests();
  }
});

test('register returns pending_email_verification even when email delivery fails', async (t) => {
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = '';
  resetEnvCacheForTests();

  try {
    const createdUser = createMockUser({
      username: 'new-username',
      email: 'new@example.com',
      emailVerifiedAt: null,
    });
    const findByEmailMock = t.mock.method(UserService, 'findByEmail', async () => null);
    const findByUsernameMock = t.mock.method(UserService, 'findByUsername', async () => null);
    const createUserMock = t.mock.method(UserService, 'createUser', async () => createdUser);
    const sendVerificationMock = t.mock.method(AuthEmailService, 'sendVerificationEmail', async () => {
      throw serviceUnavailable('Unable to send the requested email right now', 'EMAIL_DELIVERY_FAILED');
    });

    const req = {
      body: {
        username: 'new-username',
        email: 'new@example.com',
        password: 'paper-lobby-stakes-2026',
        turnstileToken: 'token',
      },
      ip: '127.0.0.1',
      cookies: {},
      get: () => undefined,
    } as any;
    const res = createResponseMock() as any;

    await AuthController.register(req, res);

    assert.equal(findByEmailMock.mock.callCount(), 1);
    assert.equal(findByUsernameMock.mock.callCount(), 1);
    assert.equal(createUserMock.mock.callCount(), 1);
    assert.equal(sendVerificationMock.mock.callCount(), 1);
    assert.equal(res.statusCode, 202);
    assert.equal((res.payload as { status?: string }).status, 'pending_email_verification');
    assert.equal((res.payload as { email?: string }).email, 'new@example.com');
  } finally {
    if (previousTurnstileSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret;
    }
    resetEnvCacheForTests();
  }
});

test('resendVerificationEmail returns email_verification_sent even when delivery fails', async (t) => {
  const user = createMockUser({ emailVerifiedAt: null });
  const userMock = t.mock.method(UserService, 'findByEmail', async () => user);
  const sendVerificationMock = t.mock.method(AuthEmailService, 'sendVerificationEmail', async () => {
    throw serviceUnavailable('Unable to send the requested email right now', 'EMAIL_DELIVERY_FAILED');
  });

  const req = {
    body: { email: 'alice@example.com' },
  } as any;
  const res = createResponseMock() as any;

  await AuthController.resendVerificationEmail(req, res);

  assert.equal(userMock.mock.callCount(), 1);
  assert.equal(sendVerificationMock.mock.callCount(), 1);
  assert.equal(res.statusCode, 202);
  assert.equal((res.payload as { status?: string }).status, 'email_verification_sent');
});

test('loginPassword accepts username identifiers without requiring an email lookup', async (t) => {
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = '';
  resetEnvCacheForTests();

  try {
    const password = 'paper-lobby-stakes-2026';
    const user = createMockUser({
      username: 'SketchMaster',
      email: 'sketch@example.com',
      passwordHash: await hashPassword(password),
    });
    const emailLookupMock = t.mock.method(UserService, 'findByEmail', async () => {
      throw new Error('email lookup should not be used for username login');
    });
    const usernameLookupMock = t.mock.method(UserService, 'findByUsername', async () => user);
    const suspiciousLoginMock = t.mock.method(AuthSessionService, 'isSuspiciousLogin', async () => false);
    const sessionMock = t.mock.method(AuthSessionService, 'createSession', async () => createIssuedSession() as any);
    const balanceMock = t.mock.method(UserService, 'getDisplayBalance', async () => '125.500000');

    const req = {
      body: {
        identifier: 'SketchMaster',
        password,
        turnstileToken: 'token',
      },
      ip: '127.0.0.1',
      cookies: {},
      get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'test-agent' : undefined),
    } as any;
    const res = createResponseMock() as any;

    await AuthController.loginPassword(req, res);

    assert.equal(emailLookupMock.mock.callCount(), 0);
    assert.equal(usernameLookupMock.mock.callCount(), 1);
    assert.equal(usernameLookupMock.mock.calls[0]?.arguments[0], 'SketchMaster');
    assert.equal(suspiciousLoginMock.mock.callCount(), 1);
    assert.equal(sessionMock.mock.callCount(), 1);
    assert.equal(balanceMock.mock.callCount(), 1);
    assert.equal((res.payload as { status?: string }).status, 'authenticated');
  } finally {
    if (previousTurnstileSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret;
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
    redirect(statusOrUrl: number | string, maybeUrl?: string) {
      this.statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
      this.payload = typeof statusOrUrl === 'string' ? statusOrUrl : maybeUrl;
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

test('me keeps the user check first but fetches session metadata and balance concurrently', async (t) => {
  let sessionsPending = false;
  let balanceObservedSessionsPending = false;
  const userMock = t.mock.method(UserService, 'findAuthUserById', async () => createMockUser());
  const listMock = t.mock.method(AuthSessionService, 'listSessions', async () => {
    sessionsPending = true;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    sessionsPending = false;
    return [{
      id: 'session-1',
      current: true,
      deviceId: 'device-1',
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1',
      createdAt: '2026-05-03T01:00:00.000Z',
      lastSeenAt: '2026-05-03T01:00:00.000Z',
      idleExpiresAt: '2026-05-03T02:00:00.000Z',
      absoluteExpiresAt: '2026-05-03T03:00:00.000Z',
    }];
  });
  const balanceMock = t.mock.method(UserService, 'getDisplayBalance', async () => {
    balanceObservedSessionsPending = sessionsPending;
    return '125.500000';
  });
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
  } as any;
  const res = createResponseMock() as any;

  await AuthController.me(req, res);

  assert.equal(userMock.mock.callCount(), 1);
  assert.equal(listMock.mock.callCount(), 1);
  assert.equal(balanceMock.mock.callCount(), 1);
  assert.equal(balanceObservedSessionsPending, true);
  assert.equal((res.payload as { user?: { balance?: string } }).user?.balance, '125.500000');
  assert.equal((res.payload as { session?: { id?: string } }).session?.id, 'session-1');
});

test('handleGoogleCallback redirects to login and logs stable session failure details when session creation fails', async (t) => {
  const googleProfileMock = t.mock.method(GoogleOAuthService, 'consumeCallback', async () => ({
    googleSubject: 'google-sub-1',
    email: 'alice@example.com',
    name: 'Alice',
    picture: null,
    redirectTo: '/play',
  }));
  const userLookupMock = t.mock.method(UserService, 'findByGoogleSubject', async () => createMockUser());
  const sessionError = serviceUnavailable('Authentication session unavailable', 'AUTH_SESSION_UNAVAILABLE', {
    operation: 'createSession',
  });
  const sessionMock = t.mock.method(AuthSessionService, 'createSession', async () => {
    throw sessionError;
  });
  const loggerMock = t.mock.method(logger, 'error', () => undefined);

  const req = {
    query: {
      state: 'oauth-state',
      code: 'oauth-code',
    },
    cookies: {},
    ip: '127.0.0.1',
    get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'test-agent' : undefined),
  } as any;
  const res = createResponseMock() as any;

  await AuthController.handleGoogleCallback(req, res);

  assert.equal(googleProfileMock.mock.callCount(), 1);
  assert.equal(userLookupMock.mock.callCount(), 1);
  assert.equal(sessionMock.mock.callCount(), 1);
  assert.equal(res.statusCode, 302);
  assert.equal(res.payload, '/auth/login?error=google');
  assert.equal(loggerMock.mock.callCount(), 1);
  assert.deepEqual(loggerMock.mock.calls[0]?.arguments.slice(0, 2), [
    'auth.google_callback_failed',
    {
      errorCode: 'AUTH_SESSION_UNAVAILABLE',
      operation: 'createSession',
      error: {
        name: 'ServiceUnavailableError',
        message: 'Authentication session unavailable',
        code: 'AUTH_SESSION_UNAVAILABLE',
        status: undefined,
      },
    },
  ]);
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

test('revokeSession scopes revocation to the authenticated user and clears site data when current', async (t) => {
  const revokeMock = t.mock.method(AuthSessionService, 'revokeSessionForUser', async () => true);
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
  assert.deepEqual(revokeMock.mock.calls[0]?.arguments, [
    'user-1',
    'session-1',
    'user_session_revoked',
  ]);
  assert.equal(listMock.mock.callCount(), 1);
  assert.equal(res.getHeader('clear-site-data'), '"cache", "cookies", "storage"');
});

test('requireMfaStepUpIfEnabled allows first-time MFA setup without a step-up', async () => {
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
  } as any;
  const res = createResponseMock() as any;
  let capturedError: unknown = null;
  let nextCalled = false;

  await new Promise<void>((resolve) => {
    requireMfaStepUpIfEnabled(req, res, (error?: unknown) => {
      capturedError = error;
      nextCalled = true;
      resolve();
    });
  });

  assert.equal(nextCalled, true);
  assert.equal(capturedError, undefined);
});

test('requireMfaStepUpIfEnabled requires a fresh step-up before replacing existing MFA', async (t) => {
  const expiryMock = t.mock.method(AuthSessionService, 'getMfaStepUpExpiry', async () => null);
  const challengeMock = t.mock.method(AuthMfaService, 'createChallenge', async () => 'challenge-1');
  const req = {
    user: {
      id: 'user-1',
      sessionId: 'session-1',
      deviceId: 'device-1',
      isAdmin: false,
      emailVerified: true,
      usernameComplete: true,
      mfaEnabled: true,
    },
  } as any;
  const res = createResponseMock() as any;
  let capturedError: { statusCode?: number; code?: string; details?: Record<string, unknown> } | undefined;

  await new Promise<void>((resolve) => {
    requireMfaStepUpIfEnabled(req, res, (error?: typeof capturedError) => {
      capturedError = error;
      resolve();
    });
  });

  assert.equal(expiryMock.mock.callCount(), 1);
  assert.equal(challengeMock.mock.callCount(), 1);
  assert.deepEqual(challengeMock.mock.calls[0]?.arguments[0], {
    userId: 'user-1',
    mode: 'stepup',
    sessionId: 'session-1',
  });
  assert.equal(capturedError?.statusCode, 403);
  assert.equal(capturedError?.code, 'MFA_REQUIRED');
  assert.equal(capturedError?.details?.challengeId, 'challenge-1');
});
