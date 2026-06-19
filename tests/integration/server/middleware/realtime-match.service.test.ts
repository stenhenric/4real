import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import type { RoomState } from '../../../../server/services/game-room.service.ts';
import { checkWin, createEmptyBoard } from '../../../../server/services/game-room.service.ts';
import { GameRoomRegistry } from '../../../../server/services/game-room-registry.service.ts';
import { MatchService } from '../../../../server/services/match.service.ts';
import { RealtimeMatchService } from '../../../../server/services/realtime-match.service.ts';
import { setRedisClientForTests } from '../../../../server/services/redis.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';
import { getSocketErrorPayload } from '../../../../server/sockets/game.socket.ts';
import { internalServerError, notFound } from '../../../../server/utils/http-error.ts';
import { SOCKET_IO_TRANSPORTS } from '../../../../shared/socket-config.ts';

function registerRealtimeEnvCleanup(t: TestContext) {
  const previous = {
    FEATURE_REDIS_SOCKET_ADAPTER: process.env.FEATURE_REDIS_SOCKET_ADAPTER,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL,
  };

  t.after(() => {
    if (previous.FEATURE_REDIS_SOCKET_ADAPTER === undefined) {
      delete process.env.FEATURE_REDIS_SOCKET_ADAPTER;
    } else {
      process.env.FEATURE_REDIS_SOCKET_ADAPTER = previous.FEATURE_REDIS_SOCKET_ADAPTER;
    }

    if (previous.JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous.JWT_SECRET;
    }

    if (previous.NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous.NODE_ENV;
    }

    if (previous.REDIS_URL === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previous.REDIS_URL;
    }

    resetEnvCacheForTests();
    setRedisClientForTests(null);
  });
}

type RedisOperation = () => unknown | Promise<unknown>;

interface RedisMultiMock {
  set(key: string, value: string, ...args: unknown[]): RedisMultiMock;
  pexpire(key: string, ttlMs: number): RedisMultiMock;
  sadd(key: string, value: string): RedisMultiMock;
  srem(key: string, value: string): RedisMultiMock;
  del(...keys: string[]): RedisMultiMock;
  exec(): Promise<Array<[null, unknown]>>;
}

function createRedisPresenceMock() {
  const values = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const redis = {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes('NX') && values.has(key)) {
        return null;
      }

      values.set(key, value);
      return 'OK';
    },
    async smembers(key: string) {
      return [...(sets.get(key) ?? new Set<string>())];
    },
    async del(...keys: string[]) {
      let deleted = 0;
      for (const key of keys) {
        if (values.delete(key)) {
          deleted += 1;
        }
        if (sets.delete(key)) {
          deleted += 1;
        }
      }
      return deleted;
    },
    async eval(_script: string, _keyCount: number, key: string, expectedValue: string) {
      if (values.get(key) !== expectedValue) {
        return 0;
      }

      values.delete(key);
      return 1;
    },
    multi(): RedisMultiMock {
      const operations: RedisOperation[] = [];
      const multi: RedisMultiMock = {
        set(key: string, value: string) {
          operations.push(() => {
            values.set(key, value);
            return 'OK';
          });
          return multi;
        },
        pexpire() {
          operations.push(() => 1);
          return multi;
        },
        sadd(key: string, value: string) {
          operations.push(() => {
            const members = sets.get(key) ?? new Set<string>();
            const hadValue = members.has(value);
            members.add(value);
            sets.set(key, members);
            return hadValue ? 0 : 1;
          });
          return multi;
        },
        srem(key: string, value: string) {
          operations.push(() => (sets.get(key)?.delete(value) ? 1 : 0));
          return multi;
        },
        del(...keys: string[]) {
          operations.push(async () => redis.del(...keys));
          return multi;
        },
        async exec() {
          const results: Array<[null, unknown]> = [];
          for (const operation of operations) {
            results.push([null, await operation()]);
          }
          return results;
        },
      };
      return multi;
    },
  };

  return { redis, sets, values };
}

function createActiveRoomState({
  roomId,
  player1Id,
  player2Id,
  currentTurn = player1Id,
  moves = [],
}: {
  roomId: string;
  player1Id: string;
  player2Id: string;
  currentTurn?: string | null;
  moves?: RoomState['moves'];
}): RoomState {
  return {
    roomId,
    players: [
      {
        userId: player1Id,
        username: 'host',
        socketId: 'host-socket',
        elo: 1200,
      },
      {
        userId: player2Id,
        username: 'guest',
        socketId: 'guest-socket',
        elo: 1180,
      },
    ],
    board: createEmptyBoard(),
    currentTurn,
    status: 'active',
    moves,
    wager: '0.000000',
    isPrivate: false,
    dbMatchId: 'db-match-1',
    projectedWinnerAmount: '0.000000',
    commissionRate: '0.000000',
  };
}

test('RealtimeMatchService.joinRoom refreshes stale cached rooms before checking participation', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const roomId = 'room-join';
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });
  const realtimeMatchService = new RealtimeMatchService(registry);

  await registry.set(roomId, {
    roomId,
    players: [{
      userId: player1Id.toString(),
      username: 'host',
      socketId: 'host-socket',
      elo: 1200,
    }],
    board: Array.from({ length: 6 }, () => Array<string | null>(7).fill(null)),
    currentTurn: null,
    status: 'waiting',
    moves: [],
    wager: '0.000000',
    isPrivate: false,
    dbMatchId: 'db-match-1',
    projectedWinnerAmount: '0.000000',
    commissionRate: '0.000000',
  });

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: id === player1Id.toString() ? player1Id : player2Id,
    username: id === player1Id.toString() ? 'host' : 'guest',
    elo: id === player1Id.toString() ? 1200 : 1180,
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => ({
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: 'guest',
    status: 'active',
    wager: 0,
    isPrivate: false,
    moveHistory: [],
  } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());

  const result = await realtimeMatchService.joinRoom({
    roomId,
    userId: player2Id.toString(),
    socketId: 'guest-socket',
  });

  assert.equal(result.activatedRoom, true);
  assert.equal(result.room.status, 'active');
  assert.equal(result.room.players.length, 2);
  assert.equal(
    result.room.players.find((player) => player.userId === player2Id.toString())?.socketId,
    'guest-socket',
  );
  assert.equal(
    (await registry.get(roomId))?.players.find((player) => player.userId === player1Id.toString())?.socketId,
    'host-socket',
  );
});

test('RealtimeMatchService.joinRoom hides private rooms from nonparticipants and does not cache them', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const roomId = 'private-room-join';
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });
  const realtimeMatchService = new RealtimeMatchService(registry);

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    username: 'outsider',
    elo: 1100,
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => ({
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: 'guest',
    status: 'active',
    wager: '0.000000',
    isPrivate: true,
    moveHistory: [],
  } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());

  await assert.rejects(
    realtimeMatchService.joinRoom({
      roomId,
      userId: outsiderId.toString(),
      socketId: 'outsider-socket',
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 404);
      assert.equal((error as { code?: string }).code, 'MATCH_NOT_FOUND');
      return true;
    },
  );
  assert.equal(await registry.get(roomId), null);
});

test('RealtimeMatchService.makeMove rejects malformed room ids before touching match storage', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });
  const realtimeMatchService = new RealtimeMatchService(registry);

  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => {
    throw new Error('getMatchByRoomId should not be called for malformed room ids');
  });

  t.after(() => getMatchMock.mock.restore());

  await assert.rejects(
    realtimeMatchService.makeMove({
      roomId: 'room id with spaces',
      userId: new mongoose.Types.ObjectId().toString(),
      col: 0,
    }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 401);
      assert.equal((error as { code?: string }).code, 'MATCH_ROOM_REQUIRED');
      return true;
    },
  );
  assert.equal(getMatchMock.mock.callCount(), 0);
});

test('RealtimeMatchService.makeMove refreshes stale cached move history before applying a move', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const roomId = 'room-stale-move';
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });
  const realtimeMatchService = new RealtimeMatchService(registry);

  await registry.set(roomId, createActiveRoomState({
    roomId,
    player1Id: player1Id.toString(),
    player2Id: player2Id.toString(),
    currentTurn: player1Id.toString(),
    moves: [],
  }));

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    username: id === player1Id.toString() ? 'host' : 'guest',
    elo: id === player1Id.toString() ? 1200 : 1180,
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => ({
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: 'guest',
    status: 'active',
    wager: '0.000000',
    isPrivate: false,
    moveHistory: [{ userId: player1Id.toString(), col: 0, row: 5 }],
  } as any));
  const persistMoveHistoryMock = mock.method(MatchService, 'persistMoveHistory', async () => {
    throw new Error('stale cached turn should not be persisted');
  });

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());
  t.after(() => persistMoveHistoryMock.mock.restore());

  const result = await realtimeMatchService.makeMove({
    roomId,
    userId: player1Id.toString(),
    col: 1,
  });

  assert.equal(result, null);
  assert.equal(persistMoveHistoryMock.mock.callCount(), 0);
  const refreshedRoom = await registry.get(roomId);
  assert.equal(refreshedRoom?.moves.length, 1);
  assert.equal(refreshedRoom?.currentTurn, player2Id.toString());
  assert.equal(
    refreshedRoom?.players.find((player) => player.userId === player1Id.toString())?.socketId,
    'host-socket',
  );
});

test('checkWin returns exactly four cells when a move completes a longer connected line', () => {
  const board = createEmptyBoard();
  for (const column of [0, 1, 2, 3, 4]) {
    const row = board[5];
    assert.ok(row);
    row[column] = 'R';
  }

  assert.deepEqual(checkWin(board, 5, 2, 'R'), [
    [5, 2],
    [5, 3],
    [5, 4],
    [5, 1],
  ]);
});

test('RealtimeMatchService.makeMove completes a winning move as a game-over result', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const roomId = 'room-winning-move';
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const moves = [
    { userId: player1Id.toString(), col: 0, row: 5 },
    { userId: player2Id.toString(), col: 1, row: 5 },
    { userId: player1Id.toString(), col: 0, row: 4 },
    { userId: player2Id.toString(), col: 1, row: 4 },
    { userId: player1Id.toString(), col: 0, row: 3 },
    { userId: player2Id.toString(), col: 2, row: 5 },
  ];
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });
  const realtimeMatchService = new RealtimeMatchService(registry);
  const activeMatch = {
    _id: new mongoose.Types.ObjectId(),
    roomId,
    player1Id,
    player2Id,
    p1Username: 'host',
    p2Username: 'guest',
    status: 'active',
    wager: '0.000000',
    isPrivate: false,
    moveHistory: moves,
  };

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    username: id === player1Id.toString() ? 'host' : 'guest',
    elo: 300,
  } as any));
  const getMatchMock = mock.method(MatchService, 'getMatchByRoomId', async () => activeMatch as any);
  const completeMatchMock = mock.method(MatchService, 'completeMatch', async (
    completedRoomId: string,
    winnerId: string,
    completedMoves: typeof moves,
  ) => {
    assert.equal(completedRoomId, roomId);
    assert.equal(winnerId, player1Id.toString());
    assert.equal(completedMoves.length, 7);

    return {
      ...activeMatch,
      status: 'completed',
      winnerId,
      settlementReason: 'winner',
      outcome: 'player1_win',
      moveHistory: completedMoves,
    } as any;
  });

  t.after(() => findUserMock.mock.restore());
  t.after(() => getMatchMock.mock.restore());
  t.after(() => completeMatchMock.mock.restore());

  const result = await realtimeMatchService.makeMove({
    roomId,
    userId: player1Id.toString(),
    col: 0,
  });

  assert.ok(result);
  assert.equal(result.type, 'game-over');
  assert.equal(result.winnerId, player1Id.toString());
  assert.equal(result.room.status, 'completed');
  assert.equal(result.room.currentTurn, null);
  assert.equal(result.room.winnerId, player1Id.toString());
  assert.deepEqual(result.winningLine, [
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ]);
  assert.equal((await registry.get(roomId))?.status, 'completed');
});

test('socket error payloads preserve operational match codes and hide internals', () => {
  assert.deepEqual(getSocketErrorPayload(notFound('Match not found', 'MATCH_NOT_FOUND')), {
    code: 'MATCH_NOT_FOUND',
    message: 'Match not found',
  });
    assert.deepEqual(getSocketErrorPayload(internalServerError('rating secret detail', 'MATCH_SETTLEMENT_FAILED')), {
      code: 'MATCH_SETTLEMENT_FAILED',
      message: 'Unexpected socket error',
    });
    const codedInternalError = new Error('raw coded database detail') as Error & { code: string };
    codedInternalError.code = 'MONGO_WRITE_FAILED';
    assert.deepEqual(getSocketErrorPayload(codedInternalError), {
      code: 'MONGO_WRITE_FAILED',
      message: 'Unexpected socket error',
    });
    assert.deepEqual(getSocketErrorPayload(new Error('raw database detail')), {
      code: 'SOCKET_ERROR',
      message: 'Unexpected socket error',
    });
  });

test('GameRoomRegistry keeps distributed room membership when a stale socket disconnects after reconnect', async (t) => {
  registerRealtimeEnvCleanup(t);
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.FEATURE_REDIS_SOCKET_ADAPTER = 'true';
  resetEnvCacheForTests();

  const { redis } = createRedisPresenceMock();
  setRedisClientForTests(redis as any);

  const roomId = 'room-redis';
  const player1Id = new mongoose.Types.ObjectId().toString();
  const player2Id = new mongoose.Types.ObjectId().toString();
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 10_000,
    activeRoomTtlMs: 10_000,
    completedRoomTtlMs: 10_000,
    cleanupIntervalMs: 10_000,
  });
  const room: RoomState = {
    roomId,
    players: [
      {
        userId: player1Id,
        username: 'host',
        socketId: null,
        elo: 1200,
      },
      {
        userId: player2Id,
        username: 'guest',
        socketId: null,
        elo: 1180,
      },
    ],
    board: Array.from({ length: 6 }, () => Array<string | null>(7).fill(null)),
    currentTurn: player1Id,
    status: 'active',
    moves: [],
    wager: '0.000000',
    isPrivate: false,
    dbMatchId: 'db-match-redis',
    projectedWinnerAmount: '0.000000',
    commissionRate: '0.000000',
  };

  await registry.set(roomId, room);
  await registry.bindSocket(roomId, player1Id, 'socket-old', 'active');
  await registry.set(roomId, {
    ...room,
    players: room.players.map((player) => (
      player.userId === player1Id
        ? { ...player, socketId: 'socket-old' }
        : player
    )),
  });
  await registry.bindSocket(roomId, player1Id, 'socket-new', 'active');
  await registry.set(roomId, {
    ...room,
    players: room.players.map((player) => (
      player.userId === player1Id
        ? { ...player, socketId: 'socket-new' }
        : player
    )),
  });

  await registry.detachSocket('socket-old');

  assert.deepEqual(await redis.smembers(`room:${roomId}:members`), [player1Id]);

  const persisted = await registry.get(roomId);
  assert.equal(
    persisted?.players.find((player) => player.userId === player1Id)?.socketId,
    'socket-new',
  );

  const roundTripped = persisted ? await registry.set(roomId, persisted) : null;
  assert.equal(
    roundTripped?.players.find((player) => player.userId === player1Id)?.socketId,
    'socket-new',
  );
});

test('GameRoomRegistry renews a distributed room lock while a room task is still running', async (t) => {
  registerRealtimeEnvCleanup(t);
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.FEATURE_REDIS_SOCKET_ADAPTER = 'true';
  resetEnvCacheForTests();

  const values = new Map<string, string>();
  let renewals = 0;
  const redis = {
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes('NX') && values.has(key)) {
        return null;
      }
      values.set(key, value);
      return 'OK';
    },
    async eval(script: string, _keyCount: number, key: string, expectedValue: string) {
      if (values.get(key) !== expectedValue) {
        return 0;
      }
      if (script.includes('pexpire')) {
        renewals += 1;
        return 1;
      }
      values.delete(key);
      return 1;
    },
  };
  setRedisClientForTests(redis as any);

  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 10_000,
    activeRoomTtlMs: 10_000,
    completedRoomTtlMs: 10_000,
    cleanupIntervalMs: 10_000,
  });
  let finishTask: (() => void) | undefined;
  const taskDone = registry.runExclusive('room-renew-lock', async () => {
    await new Promise<void>((resolve) => {
      finishTask = resolve;
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 2_650));
  assert.ok(renewals >= 1);
  finishTask?.();
  await taskDone;
});

test('Socket.IO transport policy is websocket-only for distributed safety', () => {
  assert.deepEqual(SOCKET_IO_TRANSPORTS, ['websocket']);
});
