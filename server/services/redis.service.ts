import { Redis } from 'ioredis';

import { getEnv } from '../config/env.ts';

let sharedRedisClient: Redis | null = null;

export function getRedisClient(): Redis {
  const env = getEnv();
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is required for Redis-backed runtime features');
  }

  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
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

export async function disconnectRedis(): Promise<void> {
  if (!sharedRedisClient) {
    return;
  }

  await sharedRedisClient.quit();
  sharedRedisClient = null;
}

export async function probeRedis(): Promise<'up' | 'down' | 'disabled'> {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return 'disabled';
  }

  try {
    const pong = await getRedisClient().ping();
    return pong === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
