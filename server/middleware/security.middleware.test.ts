import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { resetEnvCacheForTests } from '../config/env.ts';
import { csrfProtectionMiddleware } from './csrf.middleware.ts';
import { validateBody } from './validate.middleware.ts';

function createResponseMock() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test('csrfProtectionMiddleware blocks state-changing requests from disallowed origins', () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
  resetEnvCacheForTests();

  const req = {
    method: 'POST',
    get: (header: string) => (header.toLowerCase() === 'origin' ? 'https://evil.example' : undefined),
  } as any;
  const res = createResponseMock() as any;
  let nextCalled = false;

  csrfProtectionMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 'INVALID_REQUEST_ORIGIN',
    message: 'Invalid request origin',
  });

  if (previousAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
  }
  resetEnvCacheForTests();
});

test('csrfProtectionMiddleware allows state-changing requests from allowed origins', () => {
  const previousAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
  resetEnvCacheForTests();

  const req = {
    method: 'PATCH',
    get: (header: string) => (header.toLowerCase() === 'origin' ? 'http://localhost:3000' : undefined),
  } as any;
  const res = createResponseMock() as any;
  let nextCalled = false;

  csrfProtectionMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);

  if (previousAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = previousAllowedOrigins;
  }
  resetEnvCacheForTests();
});

test('validateBody parses and replaces the request body', () => {
  const middleware = validateBody(z.object({ amount: z.coerce.number().positive() }));
  const req = { body: { amount: '12.5' } } as any;
  const res = createResponseMock() as any;
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.body, { amount: 12.5 });
});
