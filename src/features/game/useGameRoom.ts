import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createGameSocket } from '../../sockets/gameSocket';
import type { GameOverState, RoomState, WinningLine } from './types';

interface GameOverPayload {
  room: RoomState;
  winnerId: string;
  winningLine?: WinningLine;
}

interface UseGameRoomOptions {
  roomId?: string;
  userId?: string;
  enabled?: boolean;
  onGameOver?: (gameOver: GameOverState, room: RoomState) => Promise<void> | void;
  onRoomError?: (message: string) => void;
}

export function useGameRoom({ roomId, userId, enabled = true, onGameOver, onRoomError }: UseGameRoomOptions) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverState | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const handleRoomError = useEffectEvent((message: string) => {
    onRoomError?.(message);
  });

  const handleGameOver = useEffectEvent(async (nextGameOver: GameOverState, nextRoom: RoomState) => {
    await onGameOver?.(nextGameOver, nextRoom);
  });

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (!roomId || !userId || !enabled) {
      setRoom(null);
      setGameOver(null);
      roomRef.current = null;
      return undefined;
    }

    setRoom(null);
    setGameOver(null);

    const socket = createGameSocket();
    socketRef.current = socket;

    const syncRoom = (nextRoom: RoomState) => {
      setRoom(nextRoom);

      if (nextRoom.status === 'completed' && nextRoom.winnerId) {
        setGameOver({ winnerId: nextRoom.winnerId });
      }
    };

    const handleConnectError = (error: Error) => {
      handleRoomError(error.message);
    };

    const handleServerError = (message: string) => {
      handleRoomError(message);
    };

    const handleGameStarted = (nextRoom: RoomState) => {
      setGameOver(null);
      setRoom(nextRoom);
    };

    const handleMoveMade = (nextRoom: RoomState) => {
      setRoom(nextRoom);
    };

    const handleGameOverEvent = async ({ room: nextRoom, winnerId, winningLine }: GameOverPayload) => {
      const nextGameOver = { winnerId, winningLine };
      setRoom(nextRoom);
      setGameOver(nextGameOver);
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
  }, [enabled, roomId, userId]);

  const makeMove = useCallback(
    (col: number) => {
      const socket = socketRef.current;
      const currentRoom = roomRef.current;

      if (!socket || !roomId || !currentRoom) {
        return;
      }

      if (currentRoom.status !== 'active' || currentRoom.currentTurn !== userId) {
        return;
      }

      socket.emit('make-move', { roomId, col });
    },
    [roomId, userId],
  );

  return { gameOver, makeMove, room };
}
