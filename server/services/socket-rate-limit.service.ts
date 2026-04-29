import { randomUUID } from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';

const localBuckets = new Map<string, number[]>();

function pruneLocalBucket(key: string, windowMs: number): number[] {
  const now = Date.now();
  const existing = localBuckets.get(key) ?? [];
  const next = existing.filter((timestamp) => timestamp > now - windowMs);
  localBuckets.set(key, next);
  return next;
}

function toZsetScore(timestamp: number): string {
  return timestamp.toString();
}

function buildRedisRateLimitKey(key: string): string {
  return `socket-rate-limit:${key}`;
}

function readMultiResultValue(
  results: Array<[Error | null, unknown]> | null,
  index: number,
): unknown {
  if (!results) {
    return undefined;
  }

  const result = results[index];
  if (!result) {
    return undefined;
  }

  const [error, value] = result;
  if (error) {
    throw error;
  }

  return value;
}

export async function isSocketRateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const env = getEnv();
  if (!env.REDIS_URL) {
    const bucket = pruneLocalBucket(key, windowMs);
    bucket.push(Date.now());
    localBuckets.set(key, bucket);
    return bucket.length > max;
  }

  const redis = getRedisClient();
  const now = Date.now();
  const redisKey = buildRedisRateLimitKey(key);
  const results = await redis
    .multi()
    .zremrangebyscore(redisKey, '-inf', toZsetScore(now - windowMs))
    .zadd(redisKey, toZsetScore(now), `${now}:${randomUUID()}`)
    .zcard(redisKey)
    .pexpire(redisKey, windowMs)
    .exec();
  const nextCount = Number(readMultiResultValue(results, 2) ?? 0);

  return nextCount > max;
}
