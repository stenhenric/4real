export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `idempotency-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
