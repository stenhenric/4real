export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly expose: boolean;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    expose = true,
    details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = expose;
    this.code = code;
    this.details = details;
  }
}

function deriveErrorCode(message: string, fallback: string): string {
  const normalized = message
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return normalized.length > 0 ? normalized : fallback;
}

export const badRequest = (message: string, code = deriveErrorCode(message, 'BAD_REQUEST'), details?: unknown) =>
  new HttpError(400, code, message, true, details);
export const unauthorized = (message: string, code = deriveErrorCode(message, 'UNAUTHORIZED'), details?: unknown) =>
  new HttpError(401, code, message, true, details);
export const forbidden = (message: string, code = deriveErrorCode(message, 'FORBIDDEN'), details?: unknown) =>
  new HttpError(403, code, message, true, details);
export const notFound = (message: string, code = deriveErrorCode(message, 'NOT_FOUND'), details?: unknown) =>
  new HttpError(404, code, message, true, details);
export const conflict = (message: string, code = deriveErrorCode(message, 'CONFLICT'), details?: unknown) =>
  new HttpError(409, code, message, true, details);
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
export const serviceUnavailable = (
  message: string,
  code = deriveErrorCode(message, 'SERVICE_UNAVAILABLE'),
  details?: unknown,
) => new HttpError(503, code, message, true, details);
