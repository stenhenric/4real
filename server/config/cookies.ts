import type { CookieOptions } from 'express';

import { getEnv } from './env.ts';

export const AUTH_COOKIE_NAME = '__Host-4real-at';
export const REFRESH_COOKIE_NAME = '__Host-4real-rt';
export const DEVICE_COOKIE_NAME = '__Host-4real-did';

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
  const env = getEnv();
  return {
    ...getBaseCookieOptions(),
    maxAge: env.AUTH_ACCESS_TTL_SECONDS * 1000,
  };
}

export function getRefreshCookieOptions(): CookieOptions {
  const env = getEnv();
  return {
    ...getBaseCookieOptions(),
    maxAge: env.AUTH_REFRESH_IDLE_TTL_SECONDS * 1000,
  };
}

export function getDeviceCookieOptions(): CookieOptions {
  const env = getEnv();
  return {
    ...getBaseCookieOptions(),
    httpOnly: true,
    maxAge: env.AUTH_DEVICE_COOKIE_TTL_SECONDS * 1000,
  };
}

export function getAuthCookieClearOptions(): CookieOptions {
  return getBaseCookieOptions();
}

export function getRefreshCookieClearOptions(): CookieOptions {
  return getBaseCookieOptions();
}

export function getDeviceCookieClearOptions(): CookieOptions {
  return getBaseCookieOptions();
}
