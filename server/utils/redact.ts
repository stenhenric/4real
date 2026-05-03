const SENSITIVE_KEY_PATTERN = /token|authorization|cookie|secret|password|api[-_]?key|bearer|session|recovery[-_]?code|totp|transaction[-_]?code|mnemonic/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 10;
const MAX_KEYS = 100;

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactInternal(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((entry) => redactInternal(entry, depth + 1));
  }

  if (typeof value === 'string') {
    return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value).slice(0, MAX_KEYS);
  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      shouldRedactKey(key) ? REDACTED : redactInternal(entry, depth + 1),
    ]),
  );
}

export function redact(value: unknown): unknown {
  return redactInternal(value, 0);
}

export function sanitizeUrlPath(path: string): string {
  try {
    const url = new URL(path, 'http://local');
    for (const key of [...url.searchParams.keys()]) {
      if (shouldRedactKey(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }

    const query = url.searchParams.toString();
    return `${url.pathname}${query.length > 0 ? `?${query}` : ''}`;
  } catch {
    return path;
  }
}
