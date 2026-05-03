import type { CookieOptions } from 'express';

import { getEnv } from './env.ts';

function getCookiePrefix(): string {
  return getEnv().NODE_ENV === 'production' ? '__Host-' : '';
}

export function getAuthCookieName(): string {
  return `${getCookiePrefix()}4real-at`;
}

export function getRefreshCookieName(): string {
  return `${getCookiePrefix()}4real-rt`;
}

export function getDeviceCookieName(): string {
  return `${getCookiePrefix()}4real-did`;
}

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
