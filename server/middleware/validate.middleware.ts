import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

import { badRequest } from '../utils/http-error.ts';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      next(badRequest(
        parsed.error.issues[0]?.message ?? 'Invalid request payload',
        'INVALID_REQUEST_PAYLOAD',
        parsed.error.issues,
      ));
      return;
    }

    req.body = parsed.data;
    next();
  };
}
