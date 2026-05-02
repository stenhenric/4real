import { createServer } from 'node:http';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

import { createApp } from './app.ts';
import { getSocketCorsOptions } from './config/cors.ts';
import { connectDB, disconnectDB } from './config/db.ts';
import { getEnv } from './config/env.ts';
import { setupIndexes } from './lib/setup-db.ts';
import { logger } from './utils/logger.ts';
import { GameRoomRegistry } from './services/game-room-registry.service.ts';
import { RealtimeMatchService } from './services/realtime-match.service.ts';
import { registerGameSocketHandlers } from './sockets/game.socket.ts';
import { registerPublicMatchEvents } from './sockets/public-match-events.ts';
import { startBackgroundJobs } from './services/background-jobs.service.ts';
import { disconnectRedis, getRedisClient } from './services/redis.service.ts';
import { UserService } from './services/user.service.ts';

export async function startServer() {
  const env = getEnv();
  const port = Number(process.env.PORT) || env.PORT || 3000;
  const host = '0.0.0.0';
  let isShuttingDown = false;

  await connectDB();
  await setupIndexes();
  await UserService.ensureSystemCommissionAccountExists();

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
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
  });
  let socketAdapterSubClient: ReturnType<typeof getRedisClient> | null = null;
  if (env.FEATURE_REDIS_SOCKET_ADAPTER && env.REDIS_URL) {
    const pubClient = getRedisClient();
    socketAdapterSubClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, socketAdapterSubClient));
  }
  io.engine.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  registerPublicMatchEvents(io);

  const realtimeMatchService = new RealtimeMatchService(roomRegistry);
  registerGameSocketHandlers(io, realtimeMatchService);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => resolve());
  });

  logger.info('server.started', {
    port,
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
      await backgroundJobs.stop();
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

      if (socketAdapterSubClient) {
        await socketAdapterSubClient.quit();
      }
      await disconnectDB();
      await disconnectRedis();
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
  process.on('unhandledRejection', (error) => {
    logger.error('process.unhandled_rejection', { error });
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', { error });
    void shutdown('uncaughtException');
  });

  return { app, httpServer, io };
}
