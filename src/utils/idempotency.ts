let idempotencyCounter = 0;

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomPart = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
    ? Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')
    : idempotencyCounter++ + Date.now();

  return `idempotency-${Date.now()}-${randomPart}`;
}
