import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

import { recordHttpRequest } from '../services/metrics.service.ts';
import { runWithTraceContext } from '../services/trace-context.service.ts';
import { getLoggedPath } from '../utils/get-logged-path.ts';
import { logger } from '../utils/logger.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const clientId = req.get('x-request-id')?.trim();
  const requestId = clientId && UUID_RE.test(clientId) ? clientId : crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  runWithTraceContext({ requestId, traceId: requestId }, () => {
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = getLoggedPath(req) ?? req.originalUrl ?? req.url;
      const roundedDurationMs = Number(durationMs.toFixed(2));
      recordHttpRequest({
        method: req.method,
        route: path,
        statusCode: res.statusCode,
        durationMs: roundedDurationMs,
      });
      logger.info('request.completed', {
        requestId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: roundedDurationMs,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  });
};
