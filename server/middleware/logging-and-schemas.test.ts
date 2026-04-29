import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { z } from 'zod';

import { ExternalSchemaError, parseExternalResponse } from '../schemas/external/parse-external-response.ts';
import { logger } from '../utils/logger.ts';

test('logger redacts bearer tokens and nested secrets before writing output', (t) => {
  let capturedOutput = '';
  const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
    capturedOutput += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  });
  t.after(() => stdoutMock.mock.restore());

  logger.info('security.test', {
    headers: {
      authorization: 'Bearer secret123',
    },
    nested: {
      apiKey: 'secret-api-key',
      safeValue: 'visible',
    },
  });

  assert.match(capturedOutput, /security\.test/);
  assert.match(capturedOutput, /\[REDACTED\]/);
  assert.match(capturedOutput, /visible/);
  assert.doesNotMatch(capturedOutput, /secret123/);
  assert.doesNotMatch(capturedOutput, /secret-api-key/);
});

test('parseExternalResponse accepts valid strict payloads', () => {
  const schema = z.object({
    ok: z.boolean(),
    payload: z.object({
      id: z.string(),
    }).strict(),
  }).strict();

  const result = parseExternalResponse(schema, {
    ok: true,
    payload: {
      id: 'abc',
    },
  }, 'external.valid');

  assert.deepEqual(result, {
    ok: true,
    payload: {
      id: 'abc',
    },
  });
});

test('parseExternalResponse rejects missing fields and unexpected extra keys', () => {
  const schema = z.object({
    ok: z.boolean(),
    payload: z.object({
      id: z.string(),
    }).strict(),
  }).strict();

  const errorMock = mock.method(logger, 'error', () => {});

  try {
    assert.throws(
      () => parseExternalResponse(schema, { ok: true, payload: {} }, 'external.missing'),
      (error: unknown) => error instanceof ExternalSchemaError,
    );
    assert.throws(
      () => parseExternalResponse(schema, {
        ok: true,
        payload: { id: 'abc', extra: true },
      }, 'external.extra'),
      (error: unknown) => error instanceof ExternalSchemaError,
    );
    assert.equal(errorMock.mock.callCount(), 2);
  } finally {
    errorMock.mock.restore();
  }
});
