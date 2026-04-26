import rateLimit from 'express-rate-limit';

import { getEnv } from '../config/env.ts';

export function createGeneralRateLimiter() {
  const env = getEnv();

  return rateLimit({
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

  return rateLimit({
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
