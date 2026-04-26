import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import type { ApiErrorDTO } from '../../shared/types/api.ts';

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      const payload: ApiErrorDTO = {
        code: 'INVALID_REQUEST_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid request payload',
        details: parsed.error.issues,
      };
      res.status(400).json(payload);
      return;
    }

    req.body = parsed.data;
    next();
  };
}
