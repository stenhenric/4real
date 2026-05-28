import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import { AuthSession, ensureAuthSessionIndexes } from '../../../../server/models/AuthSession.ts';
import { serviceUnavailable } from '../../../../server/utils/http-error.ts';
import { logger } from '../../../../server/utils/logger.ts';
import { UserService } from '../../../../server/services/user.service.ts';
import {
  AuthSessionService,
  buildActiveSessionQuery,
  resetAuthSessionDependenciesForTests,
  setAuthSessionDependenciesForTests,
} from '../../../../server/services/auth-session.service.ts';
import { hashOpaqueToken } from '../../../../server/services/auth-crypto.service.ts';

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
    _id: new mongoose.Types.ObjectId(),
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

test('createSession active-session operators survive mongoose sanitizeFilter', async (t) => {
  const user = createMockUser();
  const originalFind = AuthSession.find.bind(AuthSession);

  t.mock.method(AuthSession, 'find', async (filter: Record<string, any>) => {
    mongoose.sanitizeFilter(filter);
    originalFind(filter).cast(AuthSession);
    return [];
  });
  t.mock.method(AuthSession, 'create', async () => {
    throw serviceUnavailable('stop after trusted filter verification', 'STOP_AFTER_TRUSTED_FILTER_VERIFICATION');
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
      && (error as { code?: string }).code === 'STOP_AFTER_TRUSTED_FILTER_VERIFICATION',
  );
});

test('createSession prunes oldest tracked devices above the per-user limit', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const user = createMockUser(userId);
  const newSession = createMockSession({
    _id: new mongoose.Types.ObjectId(),
    sessionId: 'session-new',
    userId,
    deviceId: 'device-new',
    currentAccessTokenHash: 'access-new',
    currentRefreshTokenHash: 'refresh-new',
    lastSeenAt: new Date('2026-05-06T00:06:00.000Z'),
    createdAt: new Date('2026-05-06T00:06:00.000Z'),
  });
  const olderSessions = Array.from({ length: 5 }, (_, index) => createMockSession({
    _id: new mongoose.Types.ObjectId(),
    sessionId: `session-old-${index + 1}`,
    userId,
    deviceId: `device-old-${index + 1}`,
    currentAccessTokenHash: `access-old-${index + 1}`,
    currentRefreshTokenHash: `refresh-old-${index + 1}`,
    lastSeenAt: new Date(Date.UTC(2026, 4, 6, 0, 5 - index, 0)),
    createdAt: new Date(Date.UTC(2026, 4, 6, 0, 5 - index, 0)),
  }));
  const findFilters: Array<Record<string, any>> = [];
  const redisCalls: Array<{ method: string; args: unknown[] }> = [];
  let capturedSort: Record<string, 1 | -1> | undefined;
  let capturedUpdateFilter: Record<string, any> | undefined;
  let capturedUpdate: Record<string, any> | undefined;

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      setex: async (...args: unknown[]) => {
        redisCalls.push({ method: 'setex', args });
        return 'OK';
      },
      del: async (...args: unknown[]) => {
        redisCalls.push({ method: 'del', args });
        return args.length;
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'find', (filter: Record<string, any>) => {
    findFilters.push(filter);
    if (findFilters.length === 1) {
      return [] as any;
    }

    return {
      sort: (sort: Record<string, 1 | -1>) => {
        capturedSort = sort;
        return [newSession, ...olderSessions] as any;
      },
    } as any;
  });
  t.mock.method(AuthSession, 'create', async () => newSession);
  t.mock.method(UserService, 'updateSecurityLogin', async () => undefined);
  const updateManyMock = t.mock.method(AuthSession, 'updateMany', async (filter: Record<string, any>, update: Record<string, any>) => {
    capturedUpdateFilter = filter;
    capturedUpdate = update;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
  });

  const result = await AuthSessionService.createSession({
    user,
    metadata: {
      deviceId: 'device-new',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    },
  });

  assert.equal(result.session, newSession);
  assert.equal(findFilters.length, 2);
  assertActiveSessionFilter(findFilters[1], {
    userId,
  });
  assert.deepEqual(capturedSort, { lastSeenAt: -1, createdAt: -1 });
  assert.equal(updateManyMock.mock.callCount(), 1);
  assert.deepEqual(capturedUpdateFilter?._id?.$in, [olderSessions[4]._id]);
  assert.equal(capturedUpdate?.$set?.revokeReason, 'tracked_device_limit_exceeded');
  assert.deepEqual(capturedUpdate?.$unset, {
    currentAccessTokenHash: '',
    currentRefreshTokenHash: '',
  });
  assert(redisCalls.some((entry) => (
    entry.method === 'del'
    && entry.args.length === 1
    && entry.args[0] === 'auth:access:access-old-5'
  )));
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
  const updateMock = t.mock.method(AuthSession, 'updateOne', async () => ({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  }) as any);
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
  assert.equal(updateMock.mock.callCount(), 1);
  const updateFilter = updateMock.mock.calls[0]?.arguments[0] as Record<string, unknown> | undefined;
  assert.equal(updateFilter?._id, session._id);
  assert.equal(updateFilter?.currentRefreshTokenHash, refreshTokenHash);
});

test('logoutFromTokens removes token hashes when revoking a session', async (t) => {
  const accessToken = 'access-token';
  const accessTokenHash = hashOpaqueToken(accessToken);
  const userId = new mongoose.Types.ObjectId();
  const session = createMockSession({
    sessionId: 'session-1',
    userId,
    currentAccessTokenHash: accessTokenHash,
    currentRefreshTokenHash: 'refresh-hash',
  });
  const redisCalls: Array<{ method: string; args: unknown[] }> = [];
  let savedAccessTokenHash: unknown = 'not-saved';
  let savedRefreshTokenHash: unknown = 'not-saved';

  session.save = async function saveRevokedSession(this: any) {
    savedAccessTokenHash = this.currentAccessTokenHash;
    savedRefreshTokenHash = this.currentRefreshTokenHash;
  };

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      get: async () => JSON.stringify({
        userId: userId.toString(),
        sessionId: 'session-1',
        deviceId: 'device-1',
      }),
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
  t.mock.method(AuthSession, 'findOne', async () => session);

  await AuthSessionService.logoutFromTokens({ accessToken });

  assert.equal(savedAccessTokenHash, undefined);
  assert.equal(savedRefreshTokenHash, undefined);
  assert.equal(session.revokeReason, 'logout');
  assert(session.revokedAt instanceof Date);
  assert(redisCalls.some((entry) => entry.method === 'setex'));
  assert(redisCalls.some((entry) => entry.method === 'del'));
});

test('AuthSession refresh-token uniqueness only indexes string hashes', () => {
  const refreshIndex = AuthSession.schema.indexes().find(([fields]) => (
    fields.currentRefreshTokenHash === 1
  ));

  assert(refreshIndex);
  assert.equal(refreshIndex[1]?.unique, true);
  assert.deepEqual(refreshIndex[1]?.partialFilterExpression, {
    currentRefreshTokenHash: { $type: 'string' },
  });
  assert.equal(refreshIndex[1]?.sparse, undefined);
});

test('AuthSession schema declares a TTL index on absoluteExpiresAt', () => {
  const absoluteExpiryIndexes = AuthSession.schema.indexes().filter(([fields]) => (
    fields.absoluteExpiresAt === 1
  ));
  const ttlIndex = absoluteExpiryIndexes.find(([fields, options]) => (
    fields.absoluteExpiresAt === 1 && options?.expireAfterSeconds === 0
  ));

  assert.equal(absoluteExpiryIndexes.length, 1);
  assert(ttlIndex);
});

test('refreshSession revokes sessions when the atomic refresh update loses the race', async (t) => {
  const refreshToken = 'refresh-token';
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const user = createMockUser();
  const session = createMockSession({
    _id: new mongoose.Types.ObjectId(),
    sessionId: 'session-1',
    userId: user._id,
    currentAccessTokenHash: 'previous-access-hash',
    currentRefreshTokenHash: refreshTokenHash,
  });

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      get: async () => null,
      setex: async () => 'OK',
      del: async () => 1,
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'findOne', async () => session);
  t.mock.method(AuthSession, 'updateOne', async () => ({
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    upsertedId: null,
  }) as any);
  t.mock.method(UserService, 'findAuthUserById', async () => user);
  const revokeMock = t.mock.method(AuthSessionService, 'revokeAllSessionsForUser', async () => undefined);

  await assert.rejects(
    () => AuthSessionService.refreshSession({
      refreshToken,
      metadata: {
        deviceId: 'device-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
    }),
    (error: unknown) => typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'SESSION_REPLAY_DETECTED',
  );

  assert.equal(revokeMock.mock.callCount(), 1);
  assert.deepEqual(revokeMock.mock.calls[0]?.arguments, [
    user._id.toString(),
    'refresh_reuse_detected',
  ]);
});

test('revokeOtherSessionsForUser revokes matching sessions with one database update', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const sessions = [
    createMockSession({
      _id: new mongoose.Types.ObjectId(),
      sessionId: 'session-old-1',
      userId,
      currentAccessTokenHash: 'access-old-1',
      currentRefreshTokenHash: 'refresh-old-1',
      save: async () => {
        throw new Error('individual session saves should be batched');
      },
    }),
    createMockSession({
      _id: new mongoose.Types.ObjectId(),
      sessionId: 'session-old-2',
      userId,
      currentAccessTokenHash: 'access-old-2',
      currentRefreshTokenHash: 'refresh-old-2',
      save: async () => {
        throw new Error('individual session saves should be batched');
      },
    }),
  ];
  const redisCalls: Array<{ method: string; args: unknown[] }> = [];
  const pipelineCommands: Array<{ method: string; args: unknown[] }> = [];
  let capturedFilter: Record<string, any> | undefined;
  let capturedUpdate: Record<string, any> | undefined;

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      del: async (...args: unknown[]) => {
        redisCalls.push({ method: 'del', args });
        return args.length;
      },
      pipeline: () => {
        const pipeline = {
          setex: (...args: unknown[]) => {
            pipelineCommands.push({ method: 'setex', args });
            return pipeline;
          },
          exec: async () => {
            redisCalls.push({ method: 'pipeline.exec', args: [...pipelineCommands] });
            return [];
          },
        };
        return pipeline;
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'find', async (filter: Record<string, any>) => {
    capturedFilter = filter;
    return sessions;
  });
  const updateManyMock = t.mock.method(AuthSession, 'updateMany', async (filter: Record<string, any>, update: Record<string, any>) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return { acknowledged: true, matchedCount: 2, modifiedCount: 2 } as any;
  });

  await AuthSessionService.revokeOtherSessionsForUser(userId.toString(), 'session-current');

  assert.equal(updateManyMock.mock.callCount(), 1);
  assert.deepEqual(capturedFilter?._id?.$in, sessions.map((session) => session._id));
  assert(capturedUpdate?.$set?.revokedAt instanceof Date);
  assert.equal(capturedUpdate?.$set?.revokeReason, 'other_sessions_revoked');
  assert.deepEqual(capturedUpdate?.$unset, {
    currentAccessTokenHash: '',
    currentRefreshTokenHash: '',
  });
  assert.deepEqual(redisCalls[0], {
    method: 'del',
    args: ['auth:access:access-old-1', 'auth:access:access-old-2'],
  });
  assert.equal(pipelineCommands.length, 2);
});

test('listSessions prunes over-limit tracked devices while keeping the current session', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const visibleSessions = Array.from({ length: 5 }, (_, index) => createMockSession({
    _id: new mongoose.Types.ObjectId(),
    sessionId: `session-visible-${index + 1}`,
    userId,
    deviceId: `device-visible-${index + 1}`,
    currentAccessTokenHash: `access-visible-${index + 1}`,
    currentRefreshTokenHash: `refresh-visible-${index + 1}`,
    lastSeenAt: new Date(Date.UTC(2026, 4, 6, 0, 10 - index, 0)),
    createdAt: new Date(Date.UTC(2026, 4, 6, 0, 10 - index, 0)),
  }));
  const currentSession = createMockSession({
    _id: new mongoose.Types.ObjectId(),
    sessionId: 'session-current',
    userId,
    deviceId: 'device-current',
    currentAccessTokenHash: 'access-current',
    currentRefreshTokenHash: 'refresh-current',
    lastSeenAt: new Date('2026-05-05T00:00:00.000Z'),
    createdAt: new Date('2026-05-05T00:00:00.000Z'),
  });
  const sessions = [...visibleSessions, currentSession];
  const redisCalls: Array<{ method: string; args: unknown[] }> = [];
  let capturedFilter: Record<string, any> | undefined;
  let capturedUpdateFilter: Record<string, any> | undefined;

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      setex: async (...args: unknown[]) => {
        redisCalls.push({ method: 'setex', args });
        return 'OK';
      },
      del: async (...args: unknown[]) => {
        redisCalls.push({ method: 'del', args });
        return args.length;
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());
  t.mock.method(AuthSession, 'find', (filter: Record<string, any>) => {
    capturedFilter = filter;
    return {
      sort: () => sessions as any,
    } as any;
  });
  const updateManyMock = t.mock.method(AuthSession, 'updateMany', async (filter: Record<string, any>) => {
    capturedUpdateFilter = filter;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
  });

  const result = await AuthSessionService.listSessions(userId.toString(), 'session-current');

  assert.equal(result.length, 5);
  assert.deepEqual(result.map((session) => session.id), [
    'session-visible-1',
    'session-visible-2',
    'session-visible-3',
    'session-visible-4',
    'session-current',
  ]);
  assertActiveSessionFilter(capturedFilter ?? {}, {
    userId: userId.toString(),
  });
  assert.equal(updateManyMock.mock.callCount(), 1);
  assert.deepEqual(capturedUpdateFilter?._id?.$in, [visibleSessions[4]._id]);
  assert(redisCalls.some((entry) => (
    entry.method === 'del'
    && entry.args.length === 1
    && entry.args[0] === 'auth:access:access-visible-5'
  )));
});

test('ensureAuthSessionIndexes replaces the legacy sparse refresh-token index and legacy absoluteExpiresAt index', async (t) => {
  const calls: string[] = [];

  t.mock.method(AuthSession.collection, 'indexes', async () => [
    { name: '_id_', key: { _id: 1 } },
    {
      name: 'currentRefreshTokenHash_1',
      key: { currentRefreshTokenHash: 1 },
      unique: true,
      sparse: true,
    },
    {
      name: 'absoluteExpiresAt_1',
      key: { absoluteExpiresAt: 1 },
    },
  ] as any);
  t.mock.method(AuthSession.collection, 'dropIndex', async (name: string) => {
    calls.push(`drop:${name}`);
    return { ok: 1 };
  });
  t.mock.method(AuthSession, 'createIndexes', async () => {
    calls.push('create');
  });

  await ensureAuthSessionIndexes();

  assert.deepEqual(calls, [
    'drop:currentRefreshTokenHash_1',
    'drop:absoluteExpiresAt_1',
    'create',
  ]);
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

test('refreshSession wraps unexpected Redis failures with AUTH_SESSION_UNAVAILABLE', async (t) => {
  const refreshToken = 'refresh-token';
  t.mock.method(logger, 'error', () => undefined);

  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      get: async () => {
        throw new Error('Redis connection failed');
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());

  await assert.rejects(
    () => AuthSessionService.refreshSession({
      refreshToken,
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
      && (error as { details?: { operation?: string } }).details?.operation === 'refreshSession',
  );
});

test('revokeOtherSessionsForUser query does not throw CastError when globally sanitizeFilter is applied', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const sessions = [
    createMockSession({
      _id: new mongoose.Types.ObjectId(),
      sessionId: 'session-old-1',
      userId,
      currentAccessTokenHash: 'access-old-1',
      currentRefreshTokenHash: 'refresh-old-1',
    }),
  ];
  
  setAuthSessionDependenciesForTests({
    getRedisClient: () => ({
      del: async () => 1,
      pipeline: () => {
        const pipeline = {
          setex: () => pipeline,
          exec: async () => [],
        };
        return pipeline as any;
      },
    }) as any,
  });
  t.after(() => resetAuthSessionDependenciesForTests());

  t.mock.method(AuthSession, 'find', async () => sessions);
  const updateManyMock = t.mock.method(AuthSession, 'updateMany', async (filter: Record<string, any>) => {
    mongoose.sanitizeFilter(filter);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
  });

  await assert.doesNotReject(
    () => AuthSessionService.revokeOtherSessionsForUser(userId.toString(), 'session-current')
  );
  
  assert.equal(updateManyMock.mock.callCount(), 1);
});

