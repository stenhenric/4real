import type { IncomingMessage } from 'node:http';
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

export function getSocketAllowRequest() {
  return (
    req: IncomingMessage,
    callback: (error: string | null | undefined, success: boolean) => void,
  ): void => {
    const rawOrigin = req.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    callback(null, isAllowedOrigin(origin));
  };
}
