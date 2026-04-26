import type { Request } from 'express';

import { badRequest } from './http-error.ts';

export function getRequiredIdempotencyKey(req: Request): string {
  const headerValue = req.get('Idempotency-Key')?.trim();
  if (!headerValue) {
    throw badRequest('Idempotency-Key header is required', 'MISSING_IDEMPOTENCY_KEY');
  }

  if (headerValue.length < 8 || headerValue.length > 128) {
    throw badRequest('Idempotency-Key must be between 8 and 128 characters', 'INVALID_IDEMPOTENCY_KEY');
  }

  return headerValue;
}
