import type { RequestHandler } from 'express';
import type { ApiErrorDTO } from '../../shared/types/api.ts';

import { isAllowedOrigin } from '../config/cors.ts';

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

export const csrfProtectionMiddleware: RequestHandler = (req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin') ?? getOriginFromReferrer(req.get('referer'));
  if (!origin || isAllowedOrigin(origin)) {
    next();
    return;
  }

  const payload: ApiErrorDTO = {
    code: 'INVALID_REQUEST_ORIGIN',
    message: 'Invalid request origin',
  };
  res.status(403).json(payload);
};
