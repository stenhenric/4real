import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

import { logger } from '../utils/logger.ts';

function getLoggedPath(req: { path?: string; originalUrl?: string }): string | undefined {
  if (typeof req.path === 'string' && req.path.length > 0) {
    return req.path;
  }

  if (typeof req.originalUrl === 'string') {
    return req.originalUrl.split('?')[0];
  }

  return undefined;
}

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const requestId = req.get('x-request-id')?.trim() || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info('request.completed', {
      requestId,
      method: req.method,
      path: getLoggedPath(req),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};
