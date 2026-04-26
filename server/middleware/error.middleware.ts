import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiErrorDTO } from '../../shared/types/api.ts';

import { HttpError } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';

function isIdentifierCastError(error: mongoose.Error.CastError): boolean {
  const normalizedPath = error.path?.toLowerCase() ?? '';
  return error.kind === 'ObjectId' || normalizedPath === '_id' || normalizedPath.endsWith('id');
}

export const notFoundApiHandler: RequestHandler = (_req, res) => {
  const payload: ApiErrorDTO = {
    code: 'NOT_FOUND',
    message: 'Not found',
  };
  res.status(404).json(payload);
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

    const payload: ApiErrorDTO = {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
    res.status(error.statusCode).json(payload);
    return;
  }

  if (error instanceof ZodError) {
    const payload: ApiErrorDTO = {
      code: 'INVALID_REQUEST_PAYLOAD',
      message: error.issues[0]?.message ?? 'Invalid request payload',
      details: error.issues,
    };
    res.status(400).json(payload);
    return;
  }

  if (error instanceof mongoose.Error.CastError && isIdentifierCastError(error)) {
    res.status(400).json({
      code: 'INVALID_IDENTIFIER',
      message: 'Invalid identifier',
    } satisfies ApiErrorDTO);
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const firstMessage = Object.values(error.errors)[0]?.message ?? 'Validation failed';
    res.status(400).json({
      code: 'VALIDATION_FAILED',
      message: firstMessage,
      details: error.errors,
    } satisfies ApiErrorDTO);
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      code: 'INVALID_JSON_PAYLOAD',
      message: 'Invalid JSON payload',
    } satisfies ApiErrorDTO);
    return;
  }

  logger.error('request.unhandled_error', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    error,
  });

  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Server error',
  } satisfies ApiErrorDTO);
};
