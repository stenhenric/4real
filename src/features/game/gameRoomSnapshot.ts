import type { GameOverState, RoomState } from './types';

export type GameRoomSessionKey = `${string}:${string}`;

export interface GameRoomSnapshot {
  key: GameRoomSessionKey;
  room: RoomState;
  gameOver: GameOverState | null;
}

export interface VisibleGameRoomSnapshot {
  room: RoomState | null;
  gameOver: GameOverState | null;
}

export function getGameRoomSessionKey({
  roomId,
  userId,
  enabled,
}: {
  roomId: string | undefined;
  userId: string | undefined;
  enabled: boolean;
}): GameRoomSessionKey | null {
  if (!enabled || !roomId || !userId) {
    return null;
  }

  return `${roomId}:${userId}`;
}

function getCompletedRoomGameOver(room: RoomState): GameOverState | null {
  if (room.status !== 'completed' || !room.winnerId) {
    return null;
  }

  return { winnerId: room.winnerId };
}

export function buildGameRoomSnapshot(
  key: GameRoomSessionKey,
  room: RoomState,
  gameOver?: GameOverState | null,
): GameRoomSnapshot {
  return {
    key,
    room,
    gameOver: gameOver === undefined ? getCompletedRoomGameOver(room) : gameOver,
  };
}

export function getVisibleGameRoomSnapshot(
  snapshot: GameRoomSnapshot | null,
  activeKey: GameRoomSessionKey | null,
): VisibleGameRoomSnapshot {
  if (!snapshot || snapshot.key !== activeKey) {
    return {
      room: null,
      gameOver: null,
    };
  }

  return {
    room: snapshot.room,
    gameOver: snapshot.gameOver,
  };
}
