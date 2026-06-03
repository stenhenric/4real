import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import { z } from 'zod';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { ExternalSchemaError, parseExternalResponse } from '../../../../server/schemas/external/parse-external-response.ts';
import { toncenterJettonWalletBalanceSchema } from '../../../../server/schemas/external/toncenter-balance.schema.ts';
import { toncenterTransferListSchema } from '../../../../server/schemas/external/toncenter-transfer.schema.ts';
import {
  CacheKeys,
  CACHE_TTLS,
  computeJitteredTtl,
  getOrPopulateJson,
  invalidateCacheKeys,
  resetCacheServiceForTests,
} from '../../../../server/services/cache.service.ts';
import { setRedisClientForTests } from '../../../../server/services/redis.service.ts';
import {
  recordFailedProofRelay,
  recordExternalProviderOperation,
  recordRedisOperation,
  recordStuckWithdrawal,
  recordTerminalFailedDeposit,
  renderMetrics,
  resetMetricsForTests,
} from '../../../../server/services/metrics.service.ts';
import { logger } from '../../../../server/utils/logger.ts';

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

test('toncenter transfer schema rejects malformed raw jetton amounts', () => {
  for (const amount of ['-1000000', '1.5', 'not-money', 1.5, -1]) {
    assert.throws(
      () => parseExternalResponse(toncenterTransferListSchema, {
        jetton_transfers: [{
          transaction_hash: 'tx-bad-amount',
          transaction_now: 1714374000,
          amount,
          source: 'EQ-source-wallet',
          destination: 'EQ-destination-wallet',
        }],
      }, 'toncenter.jetton_transfers'),
      ExternalSchemaError,
    );
  }
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

test('cache-aside falls back to the loader when Redis operations fail', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'rediss://cache.example.invalid:6379';
  resetEnvCacheForTests();
  resetCacheServiceForTests();
  setRedisClientForTests({
    async get() {
      throw new Error('redis read unavailable');
    },
    async set() {
      throw new Error('redis write unavailable');
    },
    async del() {
      throw new Error('redis delete unavailable');
    },
  } as any);

  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }

    setRedisClientForTests(null);
    resetEnvCacheForTests();
    resetCacheServiceForTests();
  });

  let loaderCalls = 0;
  const result = await getOrPopulateJson({
    key: CacheKeys.leaderboard(10),
    ttlSeconds: CACHE_TTLS.leaderboard,
    loader: async () => {
      loaderCalls += 1;
      return { source: 'database' };
    },
  });

  assert.equal(loaderCalls, 1);
  assert.equal(result.cacheStatus, 'miss');
  assert.deepEqual(result.value, { source: 'database' });
});

test('cache invalidation logs Redis delete failures without throwing', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  process.env.NODE_ENV = 'development';
  process.env.REDIS_URL = 'rediss://cache.example.invalid:6379';
  resetEnvCacheForTests();
  resetCacheServiceForTests();
  setRedisClientForTests({
    async get() {
      return null;
    },
    async set() {
      return 'OK';
    },
    async del() {
      throw new Error('redis delete unavailable');
    },
  } as any);
  const warnMock = mock.method(logger, 'warn', () => {});

  t.after(() => {
    warnMock.mock.restore();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }

    setRedisClientForTests(null);
    resetEnvCacheForTests();
    resetCacheServiceForTests();
  });

  await invalidateCacheKeys([CacheKeys.leaderboard(10)]);

  assert.equal(warnMock.mock.callCount(), 1);
  assert.equal(warnMock.mock.calls[0].arguments[0], 'cache.invalidate_failed');
});

test('cache keys are namespaced, versioned, and encode unsafe key parts', () => {
  const key = CacheKeys.jettonWallet('wallet/with spaces', 'jetton?master=1');

  assert.match(key, /^4real:cache:jettonWallet:v1:/);
  assert.doesNotMatch(key, /wallet\/with spaces/);
  assert.doesNotMatch(key, /jetton\?master=1/);
  assert.match(key, /wallet%2Fwith%20spaces/);
  assert.match(key, /jetton%3Fmaster%3D1/);
});

test('dependency metrics expose Redis and external provider duration buckets without sensitive labels', async () => {
  resetMetricsForTests();

  recordRedisOperation({ operation: 'ping', outcome: 'success', durationMs: 12 });
  recordExternalProviderOperation({
    provider: 'toncenter',
    operation: 'jetton_transfers',
    outcome: 'success',
    durationMs: 345,
  });

  const metrics = await renderMetrics();

  assert.match(metrics, /redis_operation_duration_ms_bucket\{operation="ping",outcome="success",le="25"\}/);
  assert.match(metrics, /external_provider_duration_ms_bucket\{operation="jetton_transfers",outcome="success",provider="toncenter",le="500"\}/);
  assert.doesNotMatch(metrics, /token|cookie|proof|boc|walletAddress|txHash/i);
});

test('money-state metrics expose irreversible states without sensitive labels', async () => {
  resetMetricsForTests();

  recordTerminalFailedDeposit('retry_exhausted');
  recordStuckWithdrawal('broadcast_unknown');
  recordFailedProofRelay('terminal_failure');

  const metrics = await renderMetrics();

  assert.match(metrics, /terminal_failed_deposits_total\{reason="retry_exhausted"\} 1/);
  assert.match(metrics, /stuck_withdrawals_total\{reason="broadcast_unknown"\} 1/);
  assert.match(metrics, /failed_proof_relays_total\{reason="terminal_failure"\} 1/);
  assert.doesNotMatch(metrics, /token|cookie|proof_payload|fileBase64|boc|walletAddress|txHash|orderId|userId/i);
});

test('cache observability records hit, miss, write, invalidate, coalesced, and loader failure events', async (t) => {
  forceMemoryOnlyCacheForTest(t);
  resetMetricsForTests();

  let loaderCalls = 0;
  const key = CacheKeys.leaderboard(10);
  await getOrPopulateJson({
    key,
    ttlSeconds: CACHE_TTLS.leaderboard,
    loader: async () => {
      loaderCalls += 1;
      return { generation: loaderCalls };
    },
  });
  await getOrPopulateJson({
    key,
    ttlSeconds: CACHE_TTLS.leaderboard,
    loader: async () => ({ generation: 999 }),
  });

  const coalescedKey = CacheKeys.activeMatches();
  await Promise.all([
    getOrPopulateJson({
      key: coalescedKey,
      ttlSeconds: CACHE_TTLS.activeMatches,
      loader: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [];
      },
    }),
    getOrPopulateJson({
      key: coalescedKey,
      ttlSeconds: CACHE_TTLS.activeMatches,
      loader: async () => [],
    }),
  ]);

  await invalidateCacheKeys([key]);
  await assert.rejects(
    getOrPopulateJson({
      key: CacheKeys.merchantConfig(),
      ttlSeconds: CACHE_TTLS.merchantConfig,
      loader: async () => {
        throw new Error('source unavailable');
      },
    }),
    /source unavailable/,
  );

  const metrics = await renderMetrics();

  assert.match(metrics, /cache_events_total\{event="miss",namespace="leaderboard"\}/);
  assert.match(metrics, /cache_events_total\{event="write",namespace="leaderboard"\}/);
  assert.match(metrics, /cache_events_total\{event="hit",namespace="leaderboard"\}/);
  assert.match(metrics, /cache_events_total\{event="invalidate",namespace="leaderboard"\}/);
  assert.match(metrics, /cache_events_total\{event="coalesced",namespace="activeMatches"\}/);
  assert.match(metrics, /cache_events_total\{event="loader_failed",namespace="merchantConfig"\}/);
  assert.doesNotMatch(metrics, /walletAddress|txHash|cookie|token|secret/i);
});
