import type { HelmetOptions } from 'helmet';

import type { AppEnv } from '../config/env.ts';

const CLOUDFLARE_TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

const PRODUCTION_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'", CLOUDFLARE_TURNSTILE_ORIGIN],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'https:', 'wss:'],
  'frame-src': [CLOUDFLARE_TURNSTILE_ORIGIN],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'media-src': ["'self'"],
};

export function getSecurityHelmetOptions(env: Pick<AppEnv, 'NODE_ENV'>): HelmetOptions {
  return {
    contentSecurityPolicy: env.NODE_ENV === 'production'
      ? {
          useDefaults: true,
          directives: PRODUCTION_CSP_DIRECTIVES,
        }
      : false,
    crossOriginEmbedderPolicy: false,
  };
}
