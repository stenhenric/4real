import type { Server } from 'socket.io';

import { extractSocketToken, verifyAuthToken } from '../services/auth-token.service.ts';
import { RealtimeMatchService } from '../services/realtime-match.service.ts';
import { logger } from '../utils/logger.ts';

interface JoinRoomPayload {
  roomId?: unknown;
}

interface MakeMovePayload {
  roomId?: unknown;
  col?: unknown;
}

function getSocketErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected socket error';
}

export function registerGameSocketHandlers(io: Server, realtimeMatchService: RealtimeMatchService): void {
  io.use((socket, next) => {
    const token = extractSocketToken(socket.handshake);
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    void verifyAuthToken(token)
      .then((user) => {
        socket.data.userId = user.id;
        socket.data.isAdmin = user.isAdmin;
        next();
      })
      .catch(() => {
        next(new Error('Invalid token'));
      });
  });

  io.on('connection', (socket) => {
    logger.info('socket.connected', {
      socketId: socket.id,
      userId: socket.data.userId,
    });

    socket.on('join-room', async (payload: JoinRoomPayload) => {
      try {
        if (typeof payload?.roomId !== 'string') {
          throw new Error('Unauthorized access');
        }

        const result = await realtimeMatchService.joinRoom({
          roomId: payload.roomId,
          userId: String(socket.data.userId),
          socketId: socket.id,
        });

        await socket.join(result.room.roomId);
        io.to(result.room.roomId).emit('room-sync', result.room);

        if (result.activatedRoom) {
          io.to(result.room.roomId).emit('game-started', result.room);
        }
      } catch (error) {
        socket.emit('error', getSocketErrorMessage(error));
      }
    });

    socket.on('make-move', async (payload: MakeMovePayload) => {
      try {
        if (
          typeof payload?.roomId !== 'string' ||
          !Number.isInteger(payload.col) ||
          Number(payload.col) < 0 ||
          Number(payload.col) > 6
        ) {
          return;
        }

        const result = await realtimeMatchService.makeMove({
          roomId: payload.roomId,
          userId: String(socket.data.userId),
          col: Number(payload.col),
        });

        if (!result) {
          return;
        }

        if (result.type === 'game-over') {
          io.to(result.room.roomId).emit('game-over', {
            room: result.room,
            winnerId: result.winnerId,
            ...(result.winningLine ? { winningLine: result.winningLine } : {}),
          });
          return;
        }

        io.to(result.room.roomId).emit('move-made', result.room);
      } catch (error) {
        socket.emit('error', getSocketErrorMessage(error));
      }
    });

    socket.on('disconnect', (reason) => {
      realtimeMatchService.handleDisconnect(socket.id);
      logger.info('socket.disconnected', {
        socketId: socket.id,
        userId: socket.data.userId,
        reason,
      });
    });
  });
}
