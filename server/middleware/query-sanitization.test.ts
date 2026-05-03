import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../config/env.ts';
import { Match } from '../models/Match.ts';
import { User } from '../models/User.ts';
import { errorHandler } from './error.middleware.ts';
import { logger } from '../utils/logger.ts';
import { MatchService } from '../services/match.service.ts';

function registerEnvCleanup(t: TestContext) {
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    MATCH_WAITING_EXPIRY_MS: process.env.MATCH_WAITING_EXPIRY_MS,
    MATCH_ACTIVE_INACTIVITY_MS: process.env.MATCH_ACTIVE_INACTIVITY_MS,
  };

  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.MATCH_WAITING_EXPIRY_MS = '900000';
  process.env.MATCH_ACTIVE_INACTIVITY_MS = '900000';
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

function hasTrustedSymbol(value: object) {
  return Object.getOwnPropertySymbols(value).some((symbol) => symbol.toString() === 'Symbol(mongoose#trustedSymbol)');
}

function createResolvedQuery<T>(items: T[]) {
  const query = {
    sort() {
      return query;
    },
    limit() {
      return query;
    },
    select() {
      return query;
    },
    then(resolve: (value: T[]) => unknown) {
      return Promise.resolve(resolve(items));
    },
  };

  return query;
}

function createResponseDouble() {
  return {
    headersSent: false,
    locals: { requestId: 'req-1' },
    statusCode: 200,
    contentType: undefined as string | undefined,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type(value: string) {
      this.contentType = value;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test('MatchService.getUserHistory trusts the participant filter', async (t) => {
  registerEnvCleanup(t);

  const capturedFilters: Record<string, unknown>[] = [];
  const findMock = mock.method(Match, 'find', ((filter: Record<string, unknown>) => {
    capturedFilters.push(filter);
    return createResolvedQuery([]);
  }) as any);

  t.after(() => findMock.mock.restore());

  await MatchService.getUserHistory('user-123', 5);

  assert.equal(capturedFilters.length, 1);
  assert.ok(hasTrustedSymbol(capturedFilters[0]));
  assert.equal(capturedFilters[0].status, 'completed');
  assert.deepEqual(capturedFilters[0].$or, [
    { player1Id: 'user-123' },
    { player2Id: 'user-123' },
  ]);
});

test('MatchService.expireStaleMatches trusts both stale-date filters', async (t) => {
  registerEnvCleanup(t);

  const capturedFilters: Record<string, unknown>[] = [];
  const findMock = mock.method(Match, 'find', ((filter: Record<string, unknown>) => {
    capturedFilters.push(filter);
    return createResolvedQuery([]);
  }) as any);

  t.after(() => findMock.mock.restore());

  const result = await MatchService.expireStaleMatches();

  assert.deepEqual(result, { waitingExpired: 0, activeExpired: 0 });
  assert.equal(capturedFilters.length, 2);
  assert.ok(hasTrustedSymbol(capturedFilters[0]));
  assert.ok(hasTrustedSymbol(capturedFilters[1]));
  assert.equal(capturedFilters[0].status, 'waiting');
  assert.equal(capturedFilters[1].status, 'active');
  assert.ok((capturedFilters[0].lastActivityAt as { $lt: unknown }).$lt instanceof Date);
  assert.ok((capturedFilters[1].lastActivityAt as { $lt: unknown }).$lt instanceof Date);
});

test('errorHandler returns INVALID_IDENTIFIER only for identifier cast errors', () => {
  const loggerMock = mock.method(logger, 'error', () => {});
  const req = { method: 'GET', originalUrl: '/api/admin/merchant/dashboard' } as any;
  const idRes = createResponseDouble();
  const dateRes = createResponseDouble();

  try {
    errorHandler(new mongoose.Error.CastError('ObjectId', 'bad-id', '_id'), req, idRes as any, (() => {}) as any);
    errorHandler(
      new mongoose.Error.CastError('date', { $gte: new Date('2026-01-01T00:00:00.000Z') }, 'createdAt'),
      req,
      dateRes as any,
      (() => {}) as any,
    );
  } finally {
    loggerMock.mock.restore();
  }

  assert.equal(idRes.statusCode, 400);
  assert.equal((idRes.body as { code?: string }).code, 'INVALID_IDENTIFIER');
  assert.equal((idRes.body as { message?: string }).message, 'Invalid identifier');
  assert.equal((idRes.body as { detail?: string }).detail, 'Invalid identifier');
  assert.equal((idRes.body as { status?: number }).status, 400);
  assert.equal(dateRes.statusCode, 500);
  assert.equal((dateRes.body as { code?: string }).code, 'INTERNAL_SERVER_ERROR');
  assert.equal((dateRes.body as { message?: string }).message, 'Internal Server Error');
  assert.equal((dateRes.body as { detail?: string }).detail, 'Internal Server Error');
  assert.equal((dateRes.body as { status?: number }).status, 500);
});
