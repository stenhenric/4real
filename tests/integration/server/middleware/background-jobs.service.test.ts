import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import {
  resetBackgroundJobDependenciesForTests,
  setBackgroundJobDependenciesForTests,
  startBackgroundJobs,
} from '../../../../server/services/background-jobs.service.ts';
import { disconnectRedis, getBullmqRedisClient, getRedisClient } from '../../../../server/services/redis.service.ts';
import { setHotWalletRuntimeForTests } from '../../../../server/services/hot-wallet-runtime.service.ts';
import { MatchService } from '../../../../server/services/match.service.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { resetWithdrawalWorkerStateForTests } from '../../../../server/workers/withdrawal-worker.ts';

function registerEnvCleanup(t: TestContext) {
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    FEATURE_BULLMQ_JOBS: process.env.FEATURE_BULLMQ_JOBS,
    REDIS_URL: process.env.REDIS_URL,
  };

  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();

  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetEnvCacheForTests();
    setHotWalletRuntimeForTests(null);
    resetWithdrawalWorkerStateForTests();
    resetBackgroundJobDependenciesForTests();
  });
}

function createTimerHandle() {
  return {
    unref() {},
  } as unknown as NodeJS.Timeout;
}

test('startBackgroundJobs uses BullMQ as the only scheduler when queue mode is enabled', async (t) => {
  registerEnvCleanup(t);
  process.env.FEATURE_BULLMQ_JOBS = 'true';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  resetEnvCacheForTests();
  setHotWalletRuntimeForTests({
    hotWalletAddress: 'wallet-address',
    hotJettonWallet: 'jetton-wallet',
    derivedHotJettonWallet: 'jetton-wallet',
  });

  const staleProcessingMock = mock.method(WithdrawalRepository, 'findStaleProcessing', async () => []);
  const bullmqStop = mock.fn(async () => {});
  const bullmqMock = mock.fn(async (definitions) => {
    assert.equal(definitions.length, 6);
    assert.deepEqual(
      definitions.map((definition) => definition.queueName),
      [
        'deposit-poll',
        'order-proof-relay',
        'withdrawal-send',
        'withdrawal-confirm',
        'hot-wallet-monitor',
        'stale-match-expiry',
      ],
    );

    return {
      stop: bullmqStop,
      probe: async () => {},
      getQueueDepths: async () => ({}),
    };
  });
  setBackgroundJobDependenciesForTests({
    startBullmqBackgroundJobs: bullmqMock,
  });
  const setIntervalMock = mock.method(globalThis, 'setInterval', (() => createTimerHandle()) as any);
  const clearIntervalMock = mock.method(globalThis, 'clearInterval', (() => undefined) as any);

  t.after(() => staleProcessingMock.mock.restore());
  t.after(() => setIntervalMock.mock.restore());
  t.after(() => clearIntervalMock.mock.restore());

  const controller = await startBackgroundJobs();
  await controller.stop();

  assert.equal(setIntervalMock.mock.callCount(), 0);
  assert.equal(bullmqMock.mock.callCount(), 1);
  assert.equal(bullmqStop.mock.callCount(), 1);
});

test('BullMQ background job processors rethrow after recording failures so BullMQ can retry', async (t) => {
  registerEnvCleanup(t);
  process.env.FEATURE_BULLMQ_JOBS = 'true';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  resetEnvCacheForTests();
  setHotWalletRuntimeForTests({
    hotWalletAddress: 'wallet-address',
    hotJettonWallet: 'jetton-wallet',
    derivedHotJettonWallet: 'jetton-wallet',
  });

  const staleProcessingMock = mock.method(WithdrawalRepository, 'findStaleProcessing', async () => []);
  const expiryError = new Error('expiry unavailable');
  const expiryMock = mock.method(MatchService, 'expireStaleMatches', async () => {
    throw expiryError;
  });
  let staleMatchProcessor: (() => Promise<void>) | undefined;
  const bullmqStop = mock.fn(async () => {});
  const bullmqMock = mock.fn(async (definitions) => {
    staleMatchProcessor = definitions.find(
      (definition: { queueName: string }) => definition.queueName === 'stale-match-expiry',
    )?.processor;
    return {
      stop: bullmqStop,
      probe: async () => {},
      getQueueDepths: async () => ({}),
    };
  });
  setBackgroundJobDependenciesForTests({
    startBullmqBackgroundJobs: bullmqMock,
  });

  t.after(() => staleProcessingMock.mock.restore());
  t.after(() => expiryMock.mock.restore());

  const controller = await startBackgroundJobs();
  try {
    assert.ok(staleMatchProcessor);
    await assert.rejects(staleMatchProcessor, /expiry unavailable/);
    assert.equal(expiryMock.mock.callCount(), 1);
  } finally {
    await controller.stop();
  }
});

test('Redis clients use fail-fast retries for app operations and blocking-safe retries for BullMQ', async (t) => {
  registerEnvCleanup(t);
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  resetEnvCacheForTests();

  t.after(async () => {
    await disconnectRedis();
  });

  const appRedis = getRedisClient();
  const bullmqRedis = getBullmqRedisClient();

  assert.equal(appRedis.options.maxRetriesPerRequest, 3);
  assert.equal(bullmqRedis.options.maxRetriesPerRequest, null);
  assert.notEqual(appRedis, bullmqRedis);
});

test('startBackgroundJobs falls back to local intervals when BullMQ mode is disabled', async (t) => {
  registerEnvCleanup(t);
  delete process.env.FEATURE_BULLMQ_JOBS;
  delete process.env.REDIS_URL;
  resetEnvCacheForTests();
  setHotWalletRuntimeForTests({
    hotWalletAddress: 'wallet-address',
    hotJettonWallet: 'jetton-wallet',
    derivedHotJettonWallet: 'jetton-wallet',
  });

  const staleProcessingMock = mock.method(WithdrawalRepository, 'findStaleProcessing', async () => []);
  const bullmqMock = mock.fn(async () => {
    throw new Error('BullMQ should not start when disabled');
  });
  setBackgroundJobDependenciesForTests({
    startBullmqBackgroundJobs: bullmqMock,
  });
  const setIntervalMock = mock.method(globalThis, 'setInterval', (() => createTimerHandle()) as any);
  const clearIntervalMock = mock.method(globalThis, 'clearInterval', (() => undefined) as any);

  t.after(() => staleProcessingMock.mock.restore());
  t.after(() => setIntervalMock.mock.restore());
  t.after(() => clearIntervalMock.mock.restore());

  const controller = await startBackgroundJobs();
  await controller.stop();

  assert.equal(bullmqMock.mock.callCount(), 0);
  assert.equal(setIntervalMock.mock.callCount(), 6);
  assert.equal(clearIntervalMock.mock.callCount(), 6);
});
