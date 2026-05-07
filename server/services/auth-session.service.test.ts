import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import { AuthSession } from '../models/AuthSession.ts';
import { serviceUnavailable } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';
import { UserService } from './user.service.ts';
import {
  AuthSessionService,
  buildActiveSessionQuery,
  resetAuthSessionDependenciesForTests,
  setAuthSessionDependenciesForTests,
} from './auth-session.service.ts';
import { hashOpaqueToken } from './auth-crypto.service.ts';

function createMockUser(id = new mongoose.Types.ObjectId()) {
  return {
    _id: id,
    username: 'alice',
    isAdmin: false,
    emailVerifiedAt: new Date('2026-05-06T00:00:00.000Z'),
    mfa: {},
  } as any;
}

function createMockSession(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-05-06T00:00:00.000Z');
  return {
    sessionId: 'session-1',
    userId: new mongoose.Types.ObjectId(),
    deviceId: 'device-1',
    currentAccessTokenHash: 'access-hash',
    currentRefreshTokenHash: 'refresh-hash',
    absoluteExpiresAt: new Date('2026-06-06T00:00:00.000Z'),
    idleExpiresAt: new Date('2026-05-16T00:00:00.000Z'),
    lastSeenAt: now,
    lastIp: '127.0.0.1',
    lastUserAgent: 'test-agent',
    save: async () => undefined,
    ...overrides,
  } as any;
}

function assertActiveSessionFilter(filter: Record<string, any>, expectations: Record<string, unknown>) {
  for (const [key, value] of Object.entries(expectations)) {
    assert.deepEqual(filter[key], value);
  }
  assert.equal(filter.revokedAt, null);
  assert(filter.absoluteExpiresAt?.$gt instanceof Date);
  assert(filter.idleExpiresAt?.$gt instanceof Date);
}

test('buildActiveSessionQuery returns fresh active-session filters on every call', () => {
  const first = buildActiveSessionQuery();
  const second = buildActiveSessionQuery();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.absoluteExpiresAt, second.absoluteExpiresAt);
  assert.notStrictEqual(first.idleExpiresAt, second.idleExpiresAt);
  assert.equal(first.revokedAt, null);
  assert.equal(second.revokedAt, null);
  assert(first.absoluteExpiresAt.$gt instanceof Date);
  assert(first.idleExpiresAt.$gt instanceof Date);
  assert(second.absoluteExpiresAt.$gt instanceof Date);
  assert(second.idleExpiresAt.$gt instanceof Date);
});

test('createSession queries active device sessions with an active-session filter', async (t) => {
  const user = createMockUser();
  let capturedFilter: Record<string, any> | undefined;

  t.mock.method(AuthSession, 'find', async (filter: Record<string, any>) => {
    capturedFilter = filter;
    return [];
  });
  t.mock.method(AuthSession, 'create', async () => {
    throw serviceUnavailable('stop after filter capture', 'STOP_AFTER_FILTER_CAPTURE');
  });

  await assert.rejects(
    () => AuthSessionService.createSession({
      user,
      metadata: {
        deviceId: 'device-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
    }),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'STOP_AFTER_FILTER_CAPTURE',
  );

  assert(capturedFilter);
  assertActiveSessionFilter(capturedFilter, {
    userId: user._id,
    deviceId: 'device-1',
  });
});

test('validateAccessToken queries the current session with an active-session filter', async (t) => {
  const accessToken = 'access-token';
  const accessTokenHash = hashOpaqueToken(accessToken);
  const user = createMockUser();
  let capturedFilter: Record<string, any> | undefined;

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      get: async () => JSON.stringify({
        userId: user._id.toString(),
        sessionId: 'session-1',
        deviceId: 'device-1',
      }),
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'findOne', async (filter: Record<string, any>) => {
    capturedFilter = filter;
    return createMockSession({
      sessionId: 'session-1',
      userId: user._id,
      currentAccessTokenHash: accessTokenHash,
    });
  });
  t.mock.method(UserService, 'findAuthUserById', async () => user);

  const context = await AuthSessionService.validateAccessToken(accessToken);

  assert.equal(context.principal.id, user._id.toString());
  assert.equal(context.principal.sessionId, 'session-1');
  assert(capturedFilter);
  assertActiveSessionFilter(capturedFilter, {
    sessionId: 'session-1',
    currentAccessTokenHash: accessTokenHash,
  });
});

test('refreshSession queries the refresh session with an active-session filter', async (t) => {
  const refreshToken = 'refresh-token';
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const user = createMockUser();
  const redisCalls: Array<{ method: string; args: unknown[] }> = [];
  let capturedFilter: Record<string, any> | undefined;
  const session = createMockSession({
    sessionId: 'session-1',
    userId: user._id,
    currentAccessTokenHash: 'previous-access-hash',
    currentRefreshTokenHash: refreshTokenHash,
  });

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      get: async () => null,
      setex: async (...args: unknown[]) => {
        redisCalls.push({ method: 'setex', args });
        return 'OK';
      },
      del: async (...args: unknown[]) => {
        redisCalls.push({ method: 'del', args });
        return 1;
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'findOne', async (filter: Record<string, any>) => {
    capturedFilter = filter;
    return session;
  });
  t.mock.method(UserService, 'findAuthUserById', async () => user);

  const result = await AuthSessionService.refreshSession({
    refreshToken,
    metadata: {
      deviceId: 'device-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    },
  });

  assert.equal(result.session, session);
  assert.equal(result.deviceId, 'device-1');
  assert(capturedFilter);
  assertActiveSessionFilter(capturedFilter, {
    currentRefreshTokenHash: refreshTokenHash,
  });
  assert(redisCalls.some((entry) => entry.method === 'setex'));
  assert(redisCalls.some((entry) => entry.method === 'del'));
});

test('isSuspiciousLogin uses independent active-session filters across sequential queries', async (t) => {
  let firstFilter: Record<string, any> | undefined;
  let secondFilter: Record<string, any> | undefined;

  t.mock.method(AuthSession, 'findOne', async (filter: Record<string, any>) => {
    firstFilter = filter;
    return null;
  });
  t.mock.method(AuthSession, 'exists', async (filter: Record<string, any>) => {
    secondFilter = filter;
    return null;
  });

  const suspicious = await AuthSessionService.isSuspiciousLogin('user-1', 'device-1');

  assert.equal(suspicious, false);
  assert(firstFilter);
  assert(secondFilter);
  assertActiveSessionFilter(firstFilter, {
    userId: 'user-1',
    deviceId: 'device-1',
  });
  assertActiveSessionFilter(secondFilter, {
    userId: 'user-1',
  });
  assert.notStrictEqual(firstFilter.absoluteExpiresAt, secondFilter.absoluteExpiresAt);
  assert.notStrictEqual(firstFilter.idleExpiresAt, secondFilter.idleExpiresAt);
});

test('createSession wraps unexpected session-store failures with AUTH_SESSION_UNAVAILABLE', async (t) => {
  const user = createMockUser();
  const castError = new mongoose.Error.CastError('date', 'bad-date', 'idleExpiresAt');

  t.mock.method(AuthSession, 'find', async () => {
    throw castError;
  });
  const loggerMock = t.mock.method(logger, 'error', () => undefined);

  await assert.rejects(
    () => AuthSessionService.createSession({
      user,
      metadata: {
        deviceId: 'device-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
    }),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && 'details' in error
      && (error as { code?: string }).code === 'AUTH_SESSION_UNAVAILABLE'
      && (error as { details?: { operation?: string } }).details?.operation === 'createSession',
  );

  assert.equal(loggerMock.mock.callCount(), 1);
  assert.deepEqual(loggerMock.mock.calls[0]?.arguments.slice(0, 2), [
    'auth.session_operation_failed',
    {
      operation: 'createSession',
      error: castError,
    },
  ]);
});
