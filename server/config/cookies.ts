import type { CookieOptions } from 'express';

import { getEnv } from './env.ts';

export const AUTH_COOKIE_NAME = 'token';
export const REFRESH_COOKIE_NAME = 'refresh_token';
const AUTH_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getBaseCookieOptions(): CookieOptions {
  const { NODE_ENV } = getEnv();

  return {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

export function getRefreshCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function getAuthCookieClearOptions(): CookieOptions {
  return getBaseCookieOptions();
}

export function getRefreshCookieClearOptions(): CookieOptions {
  return getBaseCookieOptions();
}
