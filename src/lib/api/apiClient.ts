const request = async <T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
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
    if (typeof data === 'object' && data !== null && 'error' in data) {
      throw new Error(String((data as { error: unknown }).error));
    }
    if (typeof data === 'string' && data.trim().length > 0) {
      throw new Error(data);
    }
    throw new Error('API Error');
  }

  return data as T;
};

export default request;
