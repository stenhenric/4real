import crypto from 'node:crypto';
import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

function getNormalizedEmailTarget(value: unknown): string {
  return typeof value === 'string' ? normalizeEmail(value) : 'invalid';
}

function getAuthenticatedActorRateLimitKey(req: Request): string {
  const userId = (req as { user?: { id?: unknown } }).user?.id;
  if (typeof userId === 'string' && userId.length > 0) {
    return hashRateLimitKey(`user:${userId}`);
  }

  return hashRateLimitKey(`ip:${ipKeyGenerator(req.ip ?? 'unknown')}`);
}

function hashRateLimitKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createAuthenticatedOperationRateLimiter(params: {
  prefix: string;
  windowMs: number;
  max: number;
}) {
  const store = createRateLimitStore(params.prefix);

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: params.windowMs,
    max: params.max,
    standardHeaders: true,
    requestPropertyName: 'operationRateLimit',
    legacyHeaders: false,
    keyGenerator: getAuthenticatedActorRateLimitKey,
    message: {
      code: 'OPERATION_RATE_LIMITED',
      message: 'Too many requests for this operation, please try again later.',
    },
  });
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

export function createAuthEmailRecipientRateLimiter() {
  const env = getEnv();
  const store = createRateLimitStore('rl:auth-email-recipient:');

  return rateLimit({
    ...(store ? { store } : {}),
    windowMs: env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_MAX,
    standardHeaders: true,
    requestPropertyName: 'authEmailRecipientRateLimit',
    legacyHeaders: false,
    keyGenerator: (req) => hashRateLimitKey(getNormalizedEmailTarget(req.body?.email)),
    message: {
      code: 'AUTH_EMAIL_RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  });
}

export function createDepositOperationRateLimiter() {
  const env = getEnv();
  return createAuthenticatedOperationRateLimiter({
    prefix: 'rl:deposit-op:',
    windowMs: env.DEPOSIT_OPERATION_RATE_LIMIT_WINDOW_MS,
    max: env.DEPOSIT_OPERATION_RATE_LIMIT_MAX,
  });
}

export function createOrderCreateRateLimiter() {
  const env = getEnv();
  return createAuthenticatedOperationRateLimiter({
    prefix: 'rl:order-create:',
    windowMs: env.ORDER_CREATE_RATE_LIMIT_WINDOW_MS,
    max: env.ORDER_CREATE_RATE_LIMIT_MAX,
  });
}

export function createMatchMutationRateLimiter() {
  const env = getEnv();
  return createAuthenticatedOperationRateLimiter({
    prefix: 'rl:match-mutation:',
    windowMs: env.MATCH_MUTATION_RATE_LIMIT_WINDOW_MS,
    max: env.MATCH_MUTATION_RATE_LIMIT_MAX,
  });
}

export function createAdminMutationRateLimiter() {
  const env = getEnv();
  return createAuthenticatedOperationRateLimiter({
    prefix: 'rl:admin-mutation:',
    windowMs: env.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS,
    max: env.ADMIN_MUTATION_RATE_LIMIT_MAX,
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
