import type { Server } from 'socket.io';
import { getEnv } from '../config/env.ts';

import { extractSocketToken, verifyAuthToken } from '../services/auth-token.service.ts';
import { RealtimeMatchService } from '../services/realtime-match.service.ts';
import { isSocketRateLimited } from '../services/socket-rate-limit.service.ts';
import { logger } from '../utils/logger.ts';

interface JoinRoomPayload {
  roomId?: unknown;
}

interface MakeMovePayload {
  roomId?: unknown;
  col?: unknown;
}

interface SocketErrorPayload {
  code: string;
  message: string;
}

function createSocketError(code: string, message: string): SocketErrorPayload {
  return { code, message };
}

function getSocketErrorPayload(error: unknown): SocketErrorPayload {
  return createSocketError(
    'SOCKET_ERROR',
    error instanceof Error ? error.message : 'Unexpected socket error',
  );
}

export function registerGameSocketHandlers(io: Server, realtimeMatchService: RealtimeMatchService): void {
  const env = getEnv();
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
    const heartbeatHandle = setInterval(() => {
      void realtimeMatchService.refreshSocketPresence(socket.id);
    }, 30_000);
    heartbeatHandle.unref?.();

    socket.on('join-room', async (payload: JoinRoomPayload) => {
      try {
        const joinRateLimitKey = `socket:join-room:${socket.data.userId}`;
        const joinRateLimited = await isSocketRateLimited(joinRateLimitKey, 5, 60_000);
        if (joinRateLimited) {
          socket.emit('error', createSocketError('JOIN_ROOM_RATE_LIMITED', 'Too many join-room requests'));
          return;
        }

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
        logger.warn('socket.join_room_failed', {
          socketId: socket.id,
          userId: socket.data.userId,
          roomId: typeof payload?.roomId === 'string' ? payload.roomId : undefined,
          error,
        });
        socket.emit('error', getSocketErrorPayload(error));
      }
    });

    socket.on('make-move', async (payload: MakeMovePayload) => {
      try {
        const moveRateLimitKey = `socket:make-move:${socket.data.userId}:${typeof payload?.roomId === 'string' ? payload.roomId : 'unknown'}`;
        const moveRateLimited = await isSocketRateLimited(moveRateLimitKey, 30, 60_000);
        if (moveRateLimited) {
          socket.emit('error', createSocketError('MAKE_MOVE_RATE_LIMITED', 'Too many move requests'));
          return;
        }

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
        socket.emit('error', getSocketErrorPayload(error));
      }
    });

    socket.on('disconnect', (reason) => {
      clearInterval(heartbeatHandle);
      void realtimeMatchService.handleDisconnect(socket.id);
      logger.info('socket.disconnected', {
        socketId: socket.id,
        userId: socket.data.userId,
        reason,
      });
    });
  });
}
