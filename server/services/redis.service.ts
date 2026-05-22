import { Redis } from 'ioredis';

import { getEnv } from '../config/env.ts';
import { recordRedisOperation } from './metrics.service.ts';

let sharedRedisClient: Redis | null = null;
let sharedBullmqRedisClient: Redis | null = null;

export function getRedisClient(): Redis {
  const env = getEnv();
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required for Redis-backed runtime features');
  }

  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(
        env.REDIS_RETRY_MAX_DELAY_MS,
        env.REDIS_RETRY_BASE_DELAY_MS * Math.max(1, attempt),
      ),
    });
  }

  return sharedRedisClient;
}

export function getBullmqRedisClient(): Redis {
  const env = getEnv();
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required for Redis-backed runtime features');
  }

  if (!sharedBullmqRedisClient) {
    sharedBullmqRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(
        env.REDIS_RETRY_MAX_DELAY_MS,
        env.REDIS_RETRY_BASE_DELAY_MS * Math.max(1, attempt),
      ),
    });
  }

  return sharedBullmqRedisClient;
}

export function setRedisClientForTests(client: Redis | null): void {
  sharedRedisClient = client;
}

export async function disconnectRedis(): Promise<void> {
  if (!sharedRedisClient && !sharedBullmqRedisClient) {
    return;
  }

  await Promise.all([
    sharedRedisClient?.quit(),
    sharedBullmqRedisClient?.quit(),
  ]);
  sharedRedisClient = null;
  sharedBullmqRedisClient = null;
}

export async function probeRedis(): Promise<'up' | 'down' | 'disabled'> {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return 'disabled';
  }

  const startedAt = performance.now();
  try {
    const pong = await getRedisClient().ping();
    const status = pong === 'PONG' ? 'up' : 'down';
    recordRedisOperation({
      operation: 'ping',
      outcome: status === 'up' ? 'success' : 'failure',
      durationMs: performance.now() - startedAt,
    });
    return status;
  } catch {
    recordRedisOperation({
      operation: 'ping',
      outcome: 'failure',
      durationMs: performance.now() - startedAt,
    });
    return 'down';
  }
}
