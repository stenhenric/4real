import type { CookieOptions } from 'express';

import { getEnv } from './env.ts';

export const AUTH_COOKIE_NAME = 'token';
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function getAuthCookieOptions(): CookieOptions {
  const { NODE_ENV } = getEnv();
  const secure = NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

export function getAuthCookieClearOptions(): CookieOptions {
  const { NODE_ENV } = getEnv();

  return {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}
