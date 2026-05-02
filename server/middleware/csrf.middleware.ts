import type { RequestHandler } from 'express';

import { isAllowedOrigin } from '../config/cors.ts';
import { forbidden } from '../utils/http-error.ts';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getOriginFromReferrer(referrer?: string): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}

export const csrfProtectionMiddleware: RequestHandler = (req, _res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin') ?? getOriginFromReferrer(req.get('referer'));
  if (origin && isAllowedOrigin(origin)) {
    next();
    return;
  }

  if (!origin) {
    next(forbidden(
      'Origin header is required for state-changing requests',
      'MISSING_REQUEST_ORIGIN',
    ));
    return;
  }

  next(forbidden('Invalid request origin', 'INVALID_REQUEST_ORIGIN'));
};
