import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';

import { resetEnvCacheForTests } from '../config/env.ts';
import {
  resetBackgroundJobDependenciesForTests,
  setBackgroundJobDependenciesForTests,
  startBackgroundJobs,
} from '../services/background-jobs.service.ts';
import { setHotWalletRuntimeForTests } from '../services/hot-wallet-runtime.service.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { resetWithdrawalWorkerStateForTests } from '../workers/withdrawal-worker.ts';

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
