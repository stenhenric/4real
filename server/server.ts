import { createServer } from 'node:http';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';

import { createApp } from './app.ts';
import { getSocketCorsOptions } from './config/cors.ts';
import { connectDB, disconnectDB } from './config/db.ts';
import { getEnv } from './config/env.ts';
import { setupIndexes } from './lib/setup-db.ts';
import { logger } from './utils/logger.ts';
import { GameRoomRegistry } from './services/game-room-registry.service.ts';
import { RealtimeMatchService } from './services/realtime-match.service.ts';
import { registerGameSocketHandlers } from './sockets/game.socket.ts';
import { startBackgroundJobs } from './services/background-jobs.service.ts';

export async function startServer() {
  const env = getEnv();
  let isShuttingDown = false;

  await connectDB();
  await setupIndexes();

  const backgroundJobs = await startBackgroundJobs();
  const roomRegistry = new GameRoomRegistry({
    waitingRoomTtlMs: env.WAITING_ROOM_TTL_MS,
    activeRoomTtlMs: env.ACTIVE_ROOM_TTL_MS,
    completedRoomTtlMs: env.COMPLETED_ROOM_TTL_MS,
    cleanupIntervalMs: env.ROOM_CLEANUP_INTERVAL_MS,
  });
  roomRegistry.start();

  const app = await createApp({
    isShuttingDown: () => isShuttingDown,
    getBackgroundJobs: () => backgroundJobs.getStatus(),
  });
  const httpServer = createServer(app);
  httpServer.requestTimeout = env.REQUEST_TIMEOUT_MS;
  httpServer.keepAliveTimeout = env.KEEP_ALIVE_TIMEOUT_MS;
  httpServer.headersTimeout = env.HEADERS_TIMEOUT_MS;

  const io = new SocketIOServer(httpServer, {
    cors: getSocketCorsOptions(),
  });
  io.engine.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const realtimeMatchService = new RealtimeMatchService(roomRegistry);
  registerGameSocketHandlers(io, realtimeMatchService);

  await new Promise<void>((resolve) => {
    httpServer.listen(env.PORT, '0.0.0.0', () => resolve());
  });

  logger.info('server.started', {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info('server.shutdown_started', { signal });

    const forceShutdownTimer = setTimeout(() => {
      logger.error('server.shutdown_forced', { signal });
      process.exit(1);
    }, 10_000);
    forceShutdownTimer.unref?.();

    try {
      backgroundJobs.stop();
      roomRegistry.stop();

      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await disconnectDB();
      logger.info('server.shutdown_completed', { signal });
      clearTimeout(forceShutdownTimer);
      process.exit(0);
    } catch (error) {
      logger.error('server.shutdown_failed', { signal, error });
      clearTimeout(forceShutdownTimer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  return { app, httpServer, io };
}
