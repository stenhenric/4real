import crypto from 'node:crypto';

import type { Server } from 'socket.io';
import { getEnv } from '../config/env.ts';

import { getAuthCookieName } from '../config/cookies.ts';
import { AuthSessionService } from '../services/auth-session.service.ts';
import { RealtimeMatchService } from '../services/realtime-match.service.ts';
import { isSocketRateLimited } from '../services/socket-rate-limit.service.ts';
import { runWithTraceContext } from '../services/trace-context.service.ts';
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

function extractAccessToken(cookieHeader?: string): string | undefined {
  const authCookieName = getAuthCookieName();
  const tokenPair = cookieHeader
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${authCookieName}=`));

  return tokenPair ? decodeURIComponent(tokenPair.split('=')[1] ?? '') : undefined;
}

export function registerGameSocketHandlers(io: Server, realtimeMatchService: RealtimeMatchService): void {
  const env = getEnv();
  io.use((socket, next) => {
    const authToken = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : undefined;
    const token = authToken ?? extractAccessToken(socket.handshake.headers.cookie);
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    void AuthSessionService.validateAccessToken(token)
      .then(({ principal }) => {
        if (!principal.emailVerified || !principal.usernameComplete) {
          next(new Error('Account setup incomplete'));
          return;
        }

        socket.data.userId = principal.id;
        socket.data.isAdmin = principal.isAdmin;
        next();
      })
      .catch(() => {
        next(new Error('Invalid token'));
      });
  });

  io.on('connection', (socket) => {
    socket.data.traceId = crypto.randomUUID();
    logger.info('socket.connected', {
      traceId: socket.data.traceId,
      socketId: socket.id,
      userId: socket.data.userId,
    });
    const heartbeatHandle = setInterval(() => {
      void realtimeMatchService.refreshSocketPresence(socket.id);
    }, 30_000);
    heartbeatHandle.unref?.();

    socket.on('join-room', async (payload: JoinRoomPayload) => {
      await runWithTraceContext(
        {
          traceId: crypto.randomUUID(),
          socketId: socket.id,
          userId: String(socket.data.userId),
        },
        async () => {
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
        }
      );
    });

    socket.on('make-move', async (payload: MakeMovePayload) => {
      await runWithTraceContext(
        {
          traceId: crypto.randomUUID(),
          socketId: socket.id,
          userId: String(socket.data.userId),
        },
        async () => {
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
            logger.warn('socket.make_move_failed', {
              socketId: socket.id,
              userId: socket.data.userId,
              roomId: typeof payload?.roomId === 'string' ? payload.roomId : undefined,
              col: Number.isInteger(payload?.col) ? Number(payload.col) : undefined,
              error,
            });
            socket.emit('error', getSocketErrorPayload(error));
          }
        },
      );
    });

    socket.on('disconnect', (reason) => {
      clearInterval(heartbeatHandle);
      void realtimeMatchService.handleDisconnect(socket.id);
      logger.info('socket.disconnected', {
        traceId: socket.data.traceId,
        socketId: socket.id,
        userId: socket.data.userId,
        reason,
      });
    });
  });
}
