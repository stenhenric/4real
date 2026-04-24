import type { CorsOptions } from 'cors';

import { getEnv } from './env.ts';

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  return getEnv().allowedOrigins.includes(origin);
}

export function getCorsOptions(): CorsOptions {
  return {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  };
}

export function getSocketCorsOptions() {
  return {
    origin: getEnv().allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  };
}
