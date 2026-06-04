import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGameRoomSnapshot,
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
    wager: 1,
    projectedWinnerAmount: 1.8,
    commissionRate: 0.1,
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

    const snapshot = buildGameRoomSnapshot(key, makeRoom({
      status: 'completed',
      winnerId: 'user-2',
    }));

    assert.deepEqual(getVisibleGameRoomSnapshot(snapshot, key), {
      room: snapshot.room,
      gameOver: { winnerId: 'user-2' },
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
});
