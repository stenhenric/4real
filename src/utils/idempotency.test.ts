import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIdempotencyKey } from './idempotency.ts';

describe('createIdempotencyKey', () => {
  it('returns crypto.randomUUID when available', () => {
    const originalCrypto = globalThis.crypto;
    const mockUUID = '123e4567-e89b-12d3-a456-426614174000';

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => mockUUID
      },
      writable: true,
      configurable: true
    });

    try {
      const key = createIdempotencyKey();
      assert.equal(key, mockUUID);
    } finally {
      if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true
        });
      } else {
        delete (globalThis as any).crypto;
      }
    }
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', (t) => {
    const originalCrypto = globalThis.crypto;
    const mockNow = 1620000000000;
    t.mock.method(Date, 'now', () => mockNow);

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = i; // Predictable bytes: 00, 01, 02, ..., 0f
          }
          return arr;
        }
      },
      writable: true,
      configurable: true
    });

    try {
      const key = createIdempotencyKey();
      assert.equal(key, `idempotency-${mockNow}-000102030405060708090a0b0c0d0e0f`);
    } finally {
      if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true
        });
      } else {
        delete (globalThis as any).crypto;
      }
    }
  });

  it('throws an error when secure random number generation is not supported', () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      writable: true,
      configurable: true
    });

    try {
      assert.throws(
        () => createIdempotencyKey(),
        { message: 'Secure random number generation is not supported in this environment.' }
      );
    } finally {
      if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true
        });
      } else {
        delete (globalThis as any).crypto;
      }
    }
  });
});
