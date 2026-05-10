let idempotencyCounter = 0;

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    if (typeof crypto.getRandomValues === 'function') {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      return `idempotency-${Date.now()}-${randomHex}`;
    }
  }

  throw new Error('Secure random number generation is not supported in this environment.');
}
