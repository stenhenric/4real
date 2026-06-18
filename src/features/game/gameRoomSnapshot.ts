import type { GameOverState, RoomState } from './types';
import type { MatchDTO } from '../../types/api';

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

  return {
    winnerId: room.winnerId,
    ...(room.outcome ? { outcome: room.outcome } : {}),
    ...(room.ratingResult ? { ratingResult: room.ratingResult } : {}),
  };
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

export function buildSettledMatchRoomSnapshot(
  key: GameRoomSessionKey,
  currentRoom: RoomState,
  settledMatch: MatchDTO,
): GameRoomSnapshot | null {
  if (
    settledMatch.roomId !== currentRoom.roomId ||
    settledMatch.status !== 'completed' ||
    !settledMatch.winnerId
  ) {
    return null;
  }

  const nextRoom: RoomState = {
    ...currentRoom,
    status: 'completed',
    currentTurn: null,
    moves: settledMatch.moveHistory,
    wager: settledMatch.wager,
    winnerId: settledMatch.winnerId,
    ...(settledMatch.projectedWinnerAmount ? { projectedWinnerAmount: settledMatch.projectedWinnerAmount } : {}),
    ...(settledMatch.commissionRate ? { commissionRate: settledMatch.commissionRate } : {}),
    ...(settledMatch.settlementReason ? { settlementReason: settledMatch.settlementReason } : {}),
    ...(settledMatch.outcome ? { outcome: settledMatch.outcome } : {}),
    ...(settledMatch.ratingResult ? { ratingResult: settledMatch.ratingResult } : {}),
  };

  return buildGameRoomSnapshot(key, nextRoom);
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
