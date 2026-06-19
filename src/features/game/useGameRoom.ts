import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createGameSocket } from '../../sockets/gameSocket';
import {
  buildGameRoomSnapshot,
  buildSettledMatchRoomSnapshot,
  getGameRoomSessionKey,
  getVisibleGameRoomSnapshot,
  type GameRoomSnapshot,
} from './gameRoomSnapshot';
import type { GameSocketError } from './socketErrorHandling';
import type { GameOverState, RoomState, WinningLine } from './types';
import type { MatchDTO } from '../../types/api';

interface GameOverPayload {
  room: RoomState;
  winnerId: string;
  outcome?: RoomState['outcome'];
  ratingResult?: RoomState['ratingResult'];
  winningLine?: WinningLine;
}

interface UseGameRoomOptions {
  roomId?: string;
  userId?: string;
  enabled?: boolean;
  onGameOver?: (gameOver: GameOverState, room: RoomState) => Promise<void> | void;
  onRoomError?: (error: GameSocketError) => void;
}

export function useGameRoom({ roomId, userId, enabled = true, onGameOver, onRoomError }: UseGameRoomOptions) {
  const [snapshot, setSnapshot] = useState<GameRoomSnapshot | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeKey = getGameRoomSessionKey({ roomId, userId, enabled });
  const { gameOver, room } = getVisibleGameRoomSnapshot(snapshot, activeKey);

  const handleRoomError = useEffectEvent((error: GameSocketError) => {
    onRoomError?.(error);
  });

  const handleGameOver = useEffectEvent(async (nextGameOver: GameOverState, nextRoom: RoomState) => {
    await onGameOver?.(nextGameOver, nextRoom);
  });

  useEffect(() => {
    if (!activeKey || !roomId || !userId) {
      return undefined;
    }

    let disposed = false;
    const socket = createGameSocket();
    socketRef.current = socket;

    const syncRoom = (nextRoom: RoomState, nextGameOver?: GameOverState | null) => {
      if (disposed) {
        return;
      }

      setSnapshot(buildGameRoomSnapshot(activeKey, nextRoom, nextGameOver));
    };

    const handleConnectError = (error: Error) => {
      handleRoomError({
        code: 'SOCKET_CONNECT_ERROR',
        message: error.message,
      });
    };

    const handleServerError = (error: string | GameSocketError) => {
      handleRoomError(typeof error === 'string' ? { message: error } : error);
    };

    const handleGameStarted = (nextRoom: RoomState) => {
      syncRoom(nextRoom, null);
    };

    const handleMoveMade = (nextRoom: RoomState) => {
      syncRoom(nextRoom);
    };

    const handleGameOverEvent = async ({ room: nextRoom, winnerId, outcome, ratingResult, winningLine }: GameOverPayload) => {
      const resolvedOutcome = outcome ?? nextRoom.outcome;
      const resolvedRatingResult = ratingResult ?? nextRoom.ratingResult;
      const nextGameOver = {
        winnerId,
        ...(resolvedOutcome ? { outcome: resolvedOutcome } : {}),
        ...(resolvedRatingResult ? { ratingResult: resolvedRatingResult } : {}),
        ...(winningLine ? { winningLine } : {}),
      };
      syncRoom(nextRoom, nextGameOver);
      await handleGameOver(nextGameOver, nextRoom);
    };

    const emitJoinRoom = () => {
      socket.emit('join-room', { roomId });
    };

    socket.on('connect', emitJoinRoom);
    socket.on('connect_error', handleConnectError);
    socket.on('error', handleServerError);
    socket.on('room-sync', syncRoom);
    socket.on('game-started', handleGameStarted);
    socket.on('move-made', handleMoveMade);
    socket.on('game-over', handleGameOverEvent);

    if (socket.connected) {
      emitJoinRoom();
    }

    return () => {
      disposed = true;
      socket.off('connect', emitJoinRoom);
      socket.off('connect_error', handleConnectError);
      socket.off('error', handleServerError);
      socket.off('room-sync', syncRoom);
      socket.off('game-started', handleGameStarted);
      socket.off('move-made', handleMoveMade);
      socket.off('game-over', handleGameOverEvent);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [activeKey, roomId, userId]);

  const makeMove = useCallback(
    (col: number) => {
      const socket = socketRef.current;
      const currentRoom = room;

      if (!socket || !roomId || !currentRoom) {
        return;
      }

      if (currentRoom.status !== 'active' || currentRoom.currentTurn !== userId) {
        return;
      }

      socket.emit('make-move', { roomId, col });
    },
    [room, roomId, userId],
  );

  const applySettledMatch = useCallback(
    (settledMatch: MatchDTO) => {
      if (!activeKey || settledMatch.roomId !== roomId) {
        return;
      }

      setSnapshot((currentSnapshot) => {
        if (!currentSnapshot || currentSnapshot.key !== activeKey) {
          return currentSnapshot;
        }

        return buildSettledMatchRoomSnapshot(activeKey, currentSnapshot.room, settledMatch) ?? currentSnapshot;
      });
    },
    [activeKey, roomId],
  );

  return { applySettledMatch, gameOver, makeMove, room };
}
