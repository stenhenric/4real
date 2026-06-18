import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGameRoomSnapshot,
  buildSettledMatchRoomSnapshot,
  getGameRoomSessionKey,
  getVisibleGameRoomSnapshot,
} from '../../../../../src/features/game/gameRoomSnapshot.ts';
import type { GameOverState, RoomState } from '../../../../../src/features/game/types.ts';

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'room-1',
    players: [],
    board: [],
    currentTurn: 'user-1',
    status: 'active',
    moves: [],
    wager: '1.000000',
    projectedWinnerAmount: '1.800000',
    commissionRate: '0.100000',
    ...overrides,
  };
}

describe('game room snapshot helpers', () => {
  it('returns null for disabled or incomplete session keys', () => {
    assert.equal(getGameRoomSessionKey({ roomId: 'room-1', userId: 'user-1', enabled: false }), null);
    assert.equal(getGameRoomSessionKey({ roomId: undefined, userId: 'user-1', enabled: true }), null);
    assert.equal(getGameRoomSessionKey({ roomId: 'room-1', userId: undefined, enabled: true }), null);
  });

  it('hides stale snapshots when the active session key changes', () => {
    const firstKey = getGameRoomSessionKey({ roomId: 'room-1', userId: 'user-1', enabled: true });
    const secondKey = getGameRoomSessionKey({ roomId: 'room-2', userId: 'user-1', enabled: true });
    assert.ok(firstKey);
    assert.ok(secondKey);

    const snapshot = buildGameRoomSnapshot(firstKey, makeRoom());

    assert.deepEqual(getVisibleGameRoomSnapshot(snapshot, secondKey), {
      room: null,
      gameOver: null,
    });
  });

  it('derives game-over state from completed rooms with a winner', () => {
    const key = getGameRoomSessionKey({ roomId: 'room-1', userId: 'user-1', enabled: true });
    assert.ok(key);

    const ratingResult = {
      status: 'applied' as const,
      outcome: 'player2_win' as const,
      formulaVersion: 'fresh-db-elo-v1',
      player1: {
        userId: 'user-1',
        before: 300,
        delta: -20,
        after: 280,
      },
      player2: {
        userId: 'user-2',
        before: 300,
        delta: 20,
        after: 320,
      },
    };
    const snapshot = buildGameRoomSnapshot(key, makeRoom({
      status: 'completed',
      winnerId: 'user-2',
      outcome: 'player2_win',
      ratingResult,
    }));

    assert.deepEqual(getVisibleGameRoomSnapshot(snapshot, key), {
      room: snapshot.room,
      gameOver: {
        winnerId: 'user-2',
        outcome: 'player2_win',
        ratingResult,
      },
    });
  });

  it('preserves explicit winning-line game-over payloads', () => {
    const key = getGameRoomSessionKey({ roomId: 'room-1', userId: 'user-1', enabled: true });
    assert.ok(key);
    const gameOver: GameOverState = {
      winnerId: 'user-1',
      winningLine: [[5, 0], [5, 1], [5, 2], [5, 3]],
    };

    const snapshot = buildGameRoomSnapshot(key, makeRoom({
      status: 'completed',
      winnerId: 'user-1',
    }), gameOver);

    assert.deepEqual(getVisibleGameRoomSnapshot(snapshot, key), {
      room: snapshot.room,
      gameOver,
    });
  });

  it('merges a settled resign response into the active room snapshot', () => {
    const key = getGameRoomSessionKey({ roomId: 'room-1', userId: 'user-1', enabled: true });
    assert.ok(key);

    const activeRoom = makeRoom({
      players: [
        { userId: 'user-1', username: 'Host', socketId: 'socket-1', elo: 300 },
        { userId: 'user-2', username: 'Guest', socketId: 'socket-2', elo: 300 },
      ],
      board: [[null, null, null, null, null, null, null]],
      moves: [{ userId: 'user-1', col: 2, row: 5 }],
      currentTurn: 'user-2',
      status: 'active',
    });

    const snapshot = buildSettledMatchRoomSnapshot(key, activeRoom, {
      roomId: 'room-1',
      p1Username: 'Host',
      player1Id: 'user-1',
      p2Username: 'Guest',
      player2Id: 'user-2',
      status: 'completed',
      winnerId: 'user-2',
      wager: '1.000000',
      isPrivate: false,
      moveHistory: [{ userId: 'user-1', col: 2, row: 5 }],
      projectedWinnerAmount: '1.800000',
      commissionRate: '0.100000',
      settlementReason: 'resigned',
      outcome: 'player2_win',
    });

    assert.ok(snapshot);
    assert.equal(snapshot.room.status, 'completed');
    assert.equal(snapshot.room.currentTurn, null);
    assert.equal(snapshot.room.winnerId, 'user-2');
    assert.equal(snapshot.room.settlementReason, 'resigned');
    assert.equal(snapshot.room.outcome, 'player2_win');
    assert.deepEqual(snapshot.room.players, activeRoom.players);
    assert.deepEqual(snapshot.room.board, activeRoom.board);
    assert.deepEqual(snapshot.gameOver, {
      winnerId: 'user-2',
      outcome: 'player2_win',
    });
  });
});
