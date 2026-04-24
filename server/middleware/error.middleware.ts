import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { HttpError } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';

export const notFoundApiHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  const requestId = res.locals.requestId;

  if (error instanceof HttpError) {
    if (error.statusCode >= 500) {
      logger.error('request.http_error', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        error,
      });
    }

    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request payload' });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: 'Invalid identifier' });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const firstMessage = Object.values(error.errors)[0]?.message ?? 'Validation failed';
    res.status(400).json({ error: firstMessage });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  logger.error('request.unhandled_error', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    error,
  });

  res.status(500).json({ error: 'Server error' });
};
