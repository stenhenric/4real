import type { ApiErrorDTO } from '../../types/api';

interface ApiRequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

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
    && (
      ('message' in value && typeof (value as { message?: unknown }).message === 'string')
      || ('detail' in value && typeof (value as { detail?: unknown }).detail === 'string')
    )
  );
}

let activeSessionRefresh: Promise<void> | null = null;

async function refreshAuthSession(): Promise<void> {
  if (!activeSessionRefresh) {
    activeSessionRefresh = (async () => {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new ApiClientError({
          status: response.status,
          message: 'Session refresh failed',
        });
      }
    })().finally(() => {
      activeSessionRefresh = null;
    });
  }

  await activeSessionRefresh;
}

const request = async <T = unknown>(endpoint: string, options?: ApiRequestOptions): Promise<T> => {
  const { skipAuthRefresh, ...fetchOptions } = options ?? {};
  const headers = new Headers(fetchOptions.headers ?? {});
  const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;

  if (hasBody && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (
    response.status === 401
    && !skipAuthRefresh
    && endpoint !== '/auth/refresh'
    && endpoint !== '/auth/login'
    && endpoint !== '/auth/register'
  ) {
    try {
      await refreshAuthSession();
      return request<T>(endpoint, {
        ...fetchOptions,
        skipAuthRefresh: true,
      });
    } catch {
      // Fall through and surface the original 401 response.
    }
  }

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
        message: data.detail ?? data.message,
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
