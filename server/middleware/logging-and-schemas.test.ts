import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import { z } from 'zod';

import { resetEnvCacheForTests } from '../config/env.ts';
import { ExternalSchemaError, parseExternalResponse } from '../schemas/external/parse-external-response.ts';
import { toncenterJettonWalletBalanceSchema } from '../schemas/external/toncenter-balance.schema.ts';
import { toncenterTransferListSchema } from '../schemas/external/toncenter-transfer.schema.ts';
import {
  CacheKeys,
  CACHE_TTLS,
  computeJitteredTtl,
  getOrPopulateJson,
  invalidateCacheKeys,
  resetCacheServiceForTests,
} from '../services/cache.service.ts';
import { logger } from '../utils/logger.ts';

function forceMemoryOnlyCacheForTest(t: TestContext) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();
  resetCacheServiceForTests();

  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    resetEnvCacheForTests();
    resetCacheServiceForTests();
  });
}

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

test('toncenter wallet schema accepts additive keys from upstream responses', () => {
  const result = parseExternalResponse(toncenterJettonWalletBalanceSchema, {
    jetton_wallets: [{
      balance: '25000000',
      address: 'EQ-wallet',
      owner: 'EQ-owner',
      jetton: 'EQ-jetton',
      last_transaction_lt: '123',
      code_hash: 'code',
      data_hash: 'data',
    }],
    address_book: {},
    metadata: { total: 1 },
  }, 'toncenter.jetton_wallets');

  assert.equal(result.jetton_wallets.length, 1);
  assert.equal(result.jetton_wallets[0]?.balance, '25000000');
});

test('toncenter transfer schema accepts additive keys and normalizes string forward payload comments', () => {
  const result = parseExternalResponse(toncenterTransferListSchema, {
    jetton_transfers: [{
      transaction_hash: 'tx-1',
      transaction_now: 1714374000,
      amount: '1000000',
      source: 'EQ-source-wallet',
      destination: 'EQ-destination-wallet',
      decoded_forward_payload: 'memo-123',
      query_id: '99',
      trace_id: 'trace-1',
      custom_payload: null,
      decoded_custom_payload: null,
      forward_ton_amount: '0',
      forward_payload: null,
      transaction_lt: '777',
      response_destination: null,
    }],
    address_book: {},
    metadata: { total: 1 },
  }, 'toncenter.jetton_transfers');

  assert.equal(result.jetton_transfers.length, 1);
  assert.deepEqual(result.jetton_transfers[0]?.decoded_forward_payload, { comment: 'memo-123' });
});

test('computeJitteredTtl keeps cache TTLs positive and never extends the declared window', (t) => {
  forceMemoryOnlyCacheForTest(t);
  const randomMock = mock.method(Math, 'random', () => 0.5);
  t.after(() => randomMock.mock.restore());

  const ttl = computeJitteredTtl(30);
  assert.equal(ttl, 28);
  assert.ok(ttl > 0);
  assert.ok(ttl <= 30);
});

test('getOrPopulateJson coalesces concurrent cache misses and serves subsequent hits from cache', async (t) => {
  forceMemoryOnlyCacheForTest(t);

  let loaderCalls = 0;
  const loader = async () => {
    loaderCalls += 1;
    return { value: 'cached' };
  };

  const [first, second] = await Promise.all([
    getOrPopulateJson({
      key: CacheKeys.leaderboard(10),
      ttlSeconds: CACHE_TTLS.leaderboard,
      loader,
    }),
    getOrPopulateJson({
      key: CacheKeys.leaderboard(10),
      ttlSeconds: CACHE_TTLS.leaderboard,
      loader,
    }),
  ]);

  const third = await getOrPopulateJson({
    key: CacheKeys.leaderboard(10),
    ttlSeconds: CACHE_TTLS.leaderboard,
    loader,
  });

  assert.equal(loaderCalls, 1);
  assert.equal(first.cacheStatus, 'miss');
  assert.equal(second.cacheStatus, 'miss');
  assert.equal(third.cacheStatus, 'hit');
  assert.deepEqual(third.value, { value: 'cached' });
});

test('invalidateCacheKeys removes cached values so the next read recomputes them', async (t) => {
  forceMemoryOnlyCacheForTest(t);

  let loaderCalls = 0;
  const key = CacheKeys.activeMatches();
  const loader = async () => {
    loaderCalls += 1;
    return { generation: loaderCalls };
  };

  await getOrPopulateJson({
    key,
    ttlSeconds: CACHE_TTLS.activeMatches,
    loader,
  });
  await invalidateCacheKeys([key]);
  const result = await getOrPopulateJson({
    key,
    ttlSeconds: CACHE_TTLS.activeMatches,
    loader,
  });

  assert.equal(loaderCalls, 2);
  assert.equal(result.cacheStatus, 'miss');
  assert.deepEqual(result.value, { generation: 2 });
});
