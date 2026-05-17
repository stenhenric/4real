interface AbortErrorOptions {
  pageUnloading?: boolean;
}

export function isAbortError(error: unknown, signal?: AbortSignal, options: AbortErrorOptions = {}) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return Boolean(
    (signal?.aborted || options.pageUnloading)
      && error instanceof TypeError
      && /^(Load failed|Failed to fetch)$/i.test(error.message),
  );
}
