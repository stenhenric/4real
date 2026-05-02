import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiErrorDTO } from '../../shared/types/api.ts';

import { HttpError, badRequest, conflict, notFound } from '../utils/http-error.ts';
import { getLoggedPath } from '../utils/get-logged-path.ts';
import { logger } from '../utils/logger.ts';

function isIdentifierCastError(error: mongoose.Error.CastError): boolean {
  const normalizedPath = error.path?.toLowerCase() ?? '';
  return error.kind === 'ObjectId' || normalizedPath === '_id' || normalizedPath.endsWith('id');
}

export const notFoundApiHandler: RequestHandler = (_req, res) => {
  const error = notFound('Not found', 'NOT_FOUND');
  res.status(error.statusCode).type('application/problem+json').json({
    type: error.type,
    title: error.title,
    status: error.statusCode,
    detail: error.message,
    code: error.code,
    message: error.message,
  } satisfies ApiErrorDTO);
};

function isDuplicateKeyError(error: unknown): error is { code: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function getDuplicateKeyHttpError(error: { keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> }) {
  const field = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0];

  if (field === 'email') {
    return conflict('Email already exists', 'EMAIL_ALREADY_EXISTS', { field });
  }

  if (field === 'username') {
    return conflict('Username already exists', 'USERNAME_ALREADY_EXISTS', { field });
  }

  return conflict('Resource already exists', 'RESOURCE_ALREADY_EXISTS', field ? { field } : undefined);
}

function toApiErrorPayload(
  req: Parameters<ErrorRequestHandler>[1],
  requestId: string | undefined,
  error: HttpError,
): ApiErrorDTO {
  const detail = error.expose ? error.message : 'Internal Server Error';
  const instance = getLoggedPath(req);

  return {
    type: error.type,
    title: error.title,
    status: error.statusCode,
    detail,
    code: error.code,
    message: detail,
    ...(instance ? { instance } : {}),
    ...(requestId ? { requestId } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

export const errorHandler: ErrorRequestHandler = (incomingError, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  const requestId = res.locals.requestId;
  let error = incomingError;

  if (error instanceof ZodError) {
    error = badRequest(
      error.issues[0]?.message ?? 'Invalid request payload',
      'INVALID_REQUEST_PAYLOAD',
      error.issues,
    );
  } else if (error instanceof mongoose.Error.CastError && isIdentifierCastError(error)) {
    error = badRequest('Invalid identifier', 'INVALID_IDENTIFIER');
  } else if (error instanceof mongoose.Error.ValidationError) {
    error = badRequest(
      Object.values(error.errors)[0]?.message ?? 'Validation failed',
      'VALIDATION_FAILED',
      error.errors,
    );
  } else if (error instanceof SyntaxError && 'body' in error) {
    error = badRequest('Invalid JSON payload', 'INVALID_JSON_PAYLOAD');
  } else if (isDuplicateKeyError(error)) {
    error = getDuplicateKeyHttpError(error);
  }

  if (error instanceof HttpError) {
    if (error.statusCode >= 500 || !error.isOperational) {
      logger.error('request.http_error', {
        requestId,
        method: req.method,
        path: getLoggedPath(req),
        error,
      });
    }

    res
      .status(error.statusCode)
      .type('application/problem+json')
      .json(toApiErrorPayload(req, requestId, error));
    return;
  }

  logger.error('request.unhandled_error', {
    requestId,
    method: req.method,
    path: getLoggedPath(req),
    error,
  });

  const instance = getLoggedPath(req);
  res.status(500).type('application/problem+json').json({
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Internal Server Error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal Server Error',
    ...(instance ? { instance } : {}),
    ...(requestId ? { requestId } : {}),
  } satisfies ApiErrorDTO);
};
