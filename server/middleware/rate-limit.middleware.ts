import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { getEnv } from '../config/env.ts';
import { getRedisClient } from '../services/redis.service.ts';

function createRateLimitStore() {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return undefined;
  }

  const redis = getRedisClient();
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<RedisReply>,
  });
}

export function createGeneralRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore();

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.GENERAL_RATE_LIMIT_WINDOW_MS,
    max: env.GENERAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  });
}

export function createAuthRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore();

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later.',
    },
  });
}

export function createWithdrawalRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore();

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.WITHDRAWAL_RATE_LIMIT_WINDOW_MS,
    max: env.WITHDRAWAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: 'WITHDRAWAL_RATE_LIMITED',
      message: 'Too many withdrawal requests, please try again later.',
    },
  });
}
