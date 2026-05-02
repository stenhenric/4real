function deriveErrorCode(message: string, fallback: string): string {
  const normalized = message
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return normalized.length > 0 ? normalized : fallback;
}

function getDefaultTitle(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 413:
      return 'Payload Too Large';
    case 415:
      return 'Unsupported Media Type';
    case 422:
      return 'Unprocessable Entity';
    case 503:
      return 'Service Unavailable';
    default:
      return 'Internal Server Error';
  }
}

function getProblemType(code: string): string {
  return `urn:4real:problem:${code.toLowerCase()}`;
}

export class AppError extends Error {
  public readonly httpStatus: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly type: string;
  public readonly title: string;
  public readonly expose: boolean;

  constructor(params: {
    httpStatus: number;
    code: string;
    message: string;
    expose?: boolean;
    details?: unknown;
    isOperational?: boolean;
    type?: string;
    title?: string;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.httpStatus = params.httpStatus;
    this.code = params.code;
    this.expose = params.expose ?? true;
    this.details = params.details;
    this.isOperational = params.isOperational ?? true;
    this.type = params.type ?? getProblemType(params.code);
    this.title = params.title ?? getDefaultTitle(params.httpStatus);
  }
}

export class HttpError extends AppError {
  public readonly statusCode: number;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    expose = true,
    details?: unknown,
  ) {
    super({
      httpStatus: statusCode,
      code,
      message,
      expose,
      details,
    });
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'BAD_REQUEST'), details?: unknown) {
    super(400, code, message, true, details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'UNAUTHORIZED'), details?: unknown) {
    super(401, code, message, true, details);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'FORBIDDEN'), details?: unknown) {
    super(403, code, message, true, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'NOT_FOUND'), details?: unknown) {
    super(404, code, message, true, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'CONFLICT'), details?: unknown) {
    super(409, code, message, true, details);
    this.name = 'ConflictError';
  }
}

export class PaymentError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'PAYMENT_ERROR'), details?: unknown) {
    super(422, code, message, true, details);
    this.name = 'PaymentError';
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'SERVICE_UNAVAILABLE'), details?: unknown) {
    super(503, code, message, true, details);
    this.name = 'ServiceUnavailableError';
  }
}

export class InternalServerAppError extends HttpError {
  constructor(message: string, code = deriveErrorCode(message, 'INTERNAL_SERVER_ERROR'), details?: unknown) {
    super(500, code, message, false, details);
    this.name = 'InternalServerAppError';
  }
}

export const badRequest = (message: string, code = deriveErrorCode(message, 'BAD_REQUEST'), details?: unknown) =>
  new ValidationError(message, code, details);
export const unauthorized = (message: string, code = deriveErrorCode(message, 'UNAUTHORIZED'), details?: unknown) =>
  new AuthError(message, code, details);
export const forbidden = (message: string, code = deriveErrorCode(message, 'FORBIDDEN'), details?: unknown) =>
  new ForbiddenError(message, code, details);
export const notFound = (message: string, code = deriveErrorCode(message, 'NOT_FOUND'), details?: unknown) =>
  new NotFoundError(message, code, details);
export const conflict = (message: string, code = deriveErrorCode(message, 'CONFLICT'), details?: unknown) =>
  new ConflictError(message, code, details);
export const payloadTooLarge = (
  message: string,
  code = deriveErrorCode(message, 'PAYLOAD_TOO_LARGE'),
  details?: unknown,
) => new HttpError(413, code, message, true, details);
export const unsupportedMediaType = (
  message: string,
  code = deriveErrorCode(message, 'UNSUPPORTED_MEDIA_TYPE'),
  details?: unknown,
) => new HttpError(415, code, message, true, details);
export const internalServerError = (
  message: string,
  code = deriveErrorCode(message, 'INTERNAL_SERVER_ERROR'),
  details?: unknown,
) => new InternalServerAppError(message, code, details);
export const serviceUnavailable = (
  message: string,
  code = deriveErrorCode(message, 'SERVICE_UNAVAILABLE'),
  details?: unknown,
) => new ServiceUnavailableError(message, code, details);
