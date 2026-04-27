import type { ApiErrorDTO } from '../../types/api';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor({
    status,
    message,
    code,
    details,
  }: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
  }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorDTO {
  return (
    typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof (value as { message?: unknown }).message === 'string'
  );
}

const request = async <T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers ?? {});
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return null as T;
  }

  let data: unknown = null;

  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (isApiErrorPayload(data)) {
      throw new ApiClientError({
        status: response.status,
        code: data.code,
        message: data.message,
        details: data.details,
      });
    }

    if (typeof data === 'string' && data.trim().length > 0) {
      throw new ApiClientError({
        status: response.status,
        message: data,
      });
    }

    throw new ApiClientError({
      status: response.status,
      message: 'API Error',
    });
  }

  return data as T;
};

export default request;
