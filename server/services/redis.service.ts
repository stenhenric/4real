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
