import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

import { getEnv } from '../config/env.ts';
import { normalizeEmail, normalizeUsername } from '../services/auth-identity.service.ts';
import { getRedisClient } from '../services/redis.service.ts';

function createRateLimitStore(prefix: string) {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return undefined;
  }

  const redis = getRedisClient();
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<RedisReply>,
  });
}

export function createGeneralRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:general:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.GENERAL_RATE_LIMIT_WINDOW_MS,
    max: env.GENERAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'generalRateLimit',
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  });
}

export function createPublicCacheableGetRateLimiter() {
  const env = getEnv();

  return rateLimit({
    windowMs: env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_WINDOW_MS,
    max: env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'publicCacheableGetRateLimit',
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  });
}

export function createAuthRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:auth:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'authRateLimit',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later.',
    },
  });
}

function getNormalizedLoginIdentifier(value: unknown): string {
  if (typeof value !== 'string') {
    return 'invalid';
  }

  return value.includes('@') ? normalizeEmail(value) : normalizeUsername(value);
}

function hashRateLimitKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createPasswordLoginIdentifierRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:auth-login-id:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'authIdentifierRateLimit',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => hashRateLimitKey(getNormalizedLoginIdentifier(req.body?.identifier)),
    message: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later.',
    },
  });
}

export function createAuthEmailRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:auth-email:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'authEmailRateLimit',
    legacyHeaders: false,
    message: {
      code: 'AUTH_EMAIL_RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  });
}

export function createWithdrawalRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:withdrawal:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.WITHDRAWAL_RATE_LIMIT_WINDOW_MS,
    max: env.WITHDRAWAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'withdrawalRateLimit',
    legacyHeaders: false,
    message: {
      code: 'WITHDRAWAL_RATE_LIMITED',
      message: 'Too many withdrawal requests, please try again later.',
    },
  });
}
