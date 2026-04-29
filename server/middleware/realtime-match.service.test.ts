import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { GameRoomRegistry } from '../services/game-room-registry.service.ts';
import { MatchService } from '../services/match.service.ts';
import { RealtimeMatchService } from '../services/realtime-match.service.ts';
import { UserService } from '../services/user.service.ts';

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
    wager: 0,
    isPrivate: false,
    dbMatchId: 'db-match-1',
    projectedWinnerAmount: 0,
    commissionRate: 0,
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
