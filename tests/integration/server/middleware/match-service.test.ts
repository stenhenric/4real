import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { Match } from '../../../../server/models/Match.ts';
import { AuditService } from '../../../../server/services/audit.service.ts';
import { MatchService } from '../../../../server/services/match.service.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';
import { createMatchRequestSchema } from '../../../../server/validation/request-schemas.ts';

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

function registerSessionCleanup(t: TestContext) {
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  t.after(() => startSessionMock.mock.restore());
}

function createMatchDocument({
  roomId = 'room-join',
  player1Id = new mongoose.Types.ObjectId(),
  player2Id,
  status = 'waiting',
  wager = '0.000000',
  isPrivate = false,
}: {
  roomId?: string;
  player1Id?: mongoose.Types.ObjectId;
  player2Id?: mongoose.Types.ObjectId;
  status?: 'waiting' | 'active' | 'completed';
  wager?: string;
  isPrivate?: boolean;
}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: player2Id ? 'guest' : undefined,
    status,
    winnerId: undefined as string | undefined,
    settlementReason: undefined as string | undefined,
    wager,
    isPrivate,
    moveHistory: [],
    lastActivityAt: new Date('2026-05-21T09:00:00.000Z'),
    createdAt: new Date('2026-05-21T09:00:00.000Z'),
    updatedAt: new Date('2026-05-21T09:00:00.000Z'),
    savedWithSession: false,
    async save(options?: { session?: unknown }) {
      this.savedWithSession = Boolean(options?.session);
      return this;
    },
  };
}

function createResolvedQuery<T>(result: T) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return Promise.resolve(result);
    },
  };
}

test('joinMatch rejects the host joining their own waiting match without locking a wager', async (t) => {
  registerSessionCleanup(t);

  const hostId = new mongoose.Types.ObjectId();
  const match = createMatchDocument({
    player1Id: hostId,
    status: 'waiting',
    wager: '5.000000',
  });
  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: hostId,
    username: 'host',
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => match as any);
  const deductMock = mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: hostId } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());
  t.after(() => deductMock.mock.restore());

  await assert.rejects(
    MatchService.joinMatch({
      roomId: match.roomId,
      userId: hostId.toString(),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'MATCH_SELF_JOIN_NOT_ALLOWED');
      return true;
    },
  );

  assert.equal(match.status, 'waiting');
  assert.equal(match.player2Id, undefined);
  assert.equal(deductMock.mock.callCount(), 0);
});

test('joinMatch is idempotent for an existing guest and does not relock their wager', async (t) => {
  registerSessionCleanup(t);

  const hostId = new mongoose.Types.ObjectId();
  const guestId = new mongoose.Types.ObjectId();
  const match = createMatchDocument({
    player1Id: hostId,
    player2Id: guestId,
    status: 'active',
    wager: '7.000000',
  });
  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: guestId,
    username: 'guest',
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => match as any);
  const deductMock = mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: guestId } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());
  t.after(() => deductMock.mock.restore());

  const joined = await MatchService.joinMatch({
    roomId: match.roomId,
    userId: guestId.toString(),
  });

  assert.equal(joined._id.toString(), match._id.toString());
  assert.equal(joined.status, 'active');
  assert.equal(joined.player2Id?.toString(), guestId.toString());
  assert.equal(deductMock.mock.callCount(), 0);
});

test('joinMatch rejects a third player from a full match before locking funds', async (t) => {
  registerSessionCleanup(t);

  const hostId = new mongoose.Types.ObjectId();
  const guestId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();
  const match = createMatchDocument({
    player1Id: hostId,
    player2Id: guestId,
    status: 'active',
    wager: '10.000000',
  });
  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: outsiderId,
    username: 'outsider',
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => match as any);
  const deductMock = mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: outsiderId } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());
  t.after(() => deductMock.mock.restore());

  await assert.rejects(
    MatchService.joinMatch({
      roomId: match.roomId,
      userId: outsiderId.toString(),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'MATCH_ALREADY_FULL');
      return true;
    },
  );

  assert.equal(match.player2Id?.toString(), guestId.toString());
  assert.equal(match.status, 'active');
  assert.equal(deductMock.mock.callCount(), 0);
});

test('resignMatch lets a waiting host cancel and refunds the locked wager', async (t) => {
  registerSessionCleanup(t);

  const hostId = new mongoose.Types.ObjectId();
  const match = createMatchDocument({
    roomId: 'room-cancel',
    player1Id: hostId,
    status: 'waiting',
    wager: '3.000000',
  });
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => match as any);
  const updateBalanceMock = mock.method(UserService, 'updateBalance', async () => ({ _id: hostId } as any));
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-1' } as any));
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => getMatchMock.mock.restore());
  t.after(() => updateBalanceMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  const resigned = await MatchService.resignMatch({
    roomId: match.roomId,
    userId: hostId.toString(),
  });

  assert.equal(resigned.status, 'completed');
  assert.equal(resigned.winnerId, 'draw');
  assert.equal(resigned.settlementReason, 'resigned');
  assert.equal((resigned as unknown as typeof match).savedWithSession, true);
  assert.equal(updateBalanceMock.mock.callCount(), 1);
  assert.equal(updateBalanceMock.mock.calls[0]?.arguments[0], hostId.toString());
  assert.equal(updateBalanceMock.mock.calls[0]?.arguments[1], '3.000000');
  assert.equal(createTransactionMock.mock.callCount(), 1);
  assert.equal((createTransactionMock.mock.calls[0]?.arguments[0] as { type?: string }).type, 'MATCH_REFUND');
});

test('resignMatch rejects non-participants without settling the match', async (t) => {
  registerSessionCleanup(t);

  const hostId = new mongoose.Types.ObjectId();
  const guestId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();
  const match = createMatchDocument({
    player1Id: hostId,
    player2Id: guestId,
    status: 'active',
    wager: '0.000000',
  });
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => match as any);

  t.after(() => getMatchMock.mock.restore());

  await assert.rejects(
    MatchService.resignMatch({
      roomId: match.roomId,
      userId: outsiderId.toString(),
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'MATCH_PARTICIPANT_REQUIRED');
      return true;
    },
  );

  assert.equal(match.status, 'active');
  assert.equal(match.winnerId, undefined);
  assert.equal(match.settlementReason, undefined);
});

test('getActiveMatches only returns public waiting matches using the indexed listing query', async (t) => {
  let capturedFilter: Record<string, unknown> | undefined;
  const findMock = mock.method(Match, 'find', (filter: Record<string, unknown>) => {
    capturedFilter = filter;
    return createResolvedQuery([]);
  });

  t.after(() => findMock.mock.restore());

  const matches = await MatchService.getActiveMatches();

  assert.deepEqual(matches, []);
  assert.deepEqual(capturedFilter, {
    status: 'waiting',
    isPrivate: false,
  });
});

test('match create request validation defaults free public matches and rejects malformed input', () => {
  assert.deepEqual(createMatchRequestSchema.parse({}), {
    wager: '0.000000',
    isPrivate: false,
  });
  assert.throws(() => createMatchRequestSchema.parse({ wager: '-1.000000', isPrivate: false }));
  assert.throws(() => createMatchRequestSchema.parse({ wager: '1.1234567', isPrivate: false }));
  assert.throws(() => createMatchRequestSchema.parse({ wager: '1.000000', isPrivate: 'true' }));
});

test('match model declares indexes for room uniqueness, active listings, expiry scans, and history lookups', () => {
  const indexes = Match.schema.indexes().map(([key, options]) => ({ key, options }));

  assert.ok(indexes.some((index) => (
    index.key.roomId === 1
    && index.options?.unique === true
  )));
  assert.ok(indexes.some((index) => (
    index.key.status === 1
    && index.key.isPrivate === 1
    && index.key.createdAt === -1
  )));
  assert.ok(indexes.some((index) => (
    index.key.status === 1
    && index.key.lastActivityAt === 1
    && index.key.createdAt === 1
  )));
  assert.ok(indexes.some((index) => (
    index.key.player1Id === 1
    && index.key.status === 1
    && index.key.createdAt === -1
  )));
  assert.ok(indexes.some((index) => (
    index.key.player2Id === 1
    && index.key.status === 1
    && index.key.createdAt === -1
  )));
});
