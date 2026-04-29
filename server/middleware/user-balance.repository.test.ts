import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../config/env.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { logger } from '../utils/logger.ts';

type AggregateRow = { total: { toString: () => string } };

function registerEnvCleanup(t: TestContext): void {
  const previousFeatureFlag = process.env.FEATURE_AGGREGATED_BALANCE_SUM;

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'x'.repeat(32);
  }
  process.env.NODE_ENV = 'test';

  t.after(() => {
    if (previousFeatureFlag === undefined) {
      delete process.env.FEATURE_AGGREGATED_BALANCE_SUM;
    } else {
      process.env.FEATURE_AGGREGATED_BALANCE_SUM = previousFeatureFlag;
    }
    resetEnvCacheForTests();
  });
}

function installUserBalancesCollectionMock(
  t: TestContext,
  params: {
    aggregateRows?: AggregateRow[];
    findRows?: Array<{ balanceRaw: string }>;
    onAggregatePipeline?: (pipeline: unknown[]) => void;
    onFindFilter?: (filter: unknown) => void;
  },
): void {
  const originalDb = mongoose.connection.db;
  const aggregateRows = params.aggregateRows ?? [];
  const findRows = params.findRows ?? [];

  Object.defineProperty(mongoose.connection, 'db', {
    configurable: true,
    value: {
      collection(name: string) {
        if (name !== 'user_balances') {
          throw new Error(`Unexpected collection lookup: ${name}`);
        }

        return {
          aggregate(pipeline: unknown[]) {
            params.onAggregatePipeline?.(pipeline);
            return {
              async toArray() {
                return aggregateRows;
              },
            };
          },
          find(filter: unknown) {
            params.onFindFilter?.(filter);
            return {
              project() {
                return {
                  async toArray() {
                    return findRows;
                  },
                };
              },
            };
          },
        };
      },
    },
  });

  t.after(() => {
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      value: originalDb,
    });
  });
}

test('sumBalanceRawAggregated returns 0n for empty result sets', async (t) => {
  registerEnvCleanup(t);
  let capturedPipeline: unknown[] | null = null;

  installUserBalancesCollectionMock(t, {
    aggregateRows: [],
    onAggregatePipeline: (pipeline) => {
      capturedPipeline = pipeline;
    },
  });

  const result = await UserBalanceRepository.sumBalanceRawAggregated({});

  assert.equal(result, 0n);
  assert.ok(capturedPipeline);
  assert.deepEqual(capturedPipeline?.[0], { $match: {} });
});

test('sumBalanceRawAggregated returns the expected sum for known balances', async (t) => {
  registerEnvCleanup(t);
  const filter = { userId: { $nin: ['system'] } };
  let capturedPipeline: unknown[] | null = null;

  installUserBalancesCollectionMock(t, {
    aggregateRows: [{ total: { toString: () => '3500000.000000000000000000000000000000' } }],
    onAggregatePipeline: (pipeline) => {
      capturedPipeline = pipeline;
    },
  });

  const result = await UserBalanceRepository.sumBalanceRawAggregated(filter);

  assert.equal(result, 3_500_000n);
  assert.deepEqual(capturedPipeline?.[0], { $match: filter });
});

test('sumBalanceRawAggregated preserves large integer precision from Decimal128 totals', async (t) => {
  registerEnvCleanup(t);
  const largeRawTotal = '1234567890123456789012345678901234';

  installUserBalancesCollectionMock(t, {
    aggregateRows: [{ total: { toString: () => largeRawTotal } }],
  });

  const result = await UserBalanceRepository.sumBalanceRawAggregated({});

  assert.equal(result, BigInt(largeRawTotal));
});

test('sumBalanceRawForLedger dual-runs and warns when aggregated and legacy totals diverge', async (t) => {
  registerEnvCleanup(t);
  process.env.FEATURE_AGGREGATED_BALANCE_SUM = 'true';
  resetEnvCacheForTests();

  let capturedFilter: unknown = null;
  installUserBalancesCollectionMock(t, {
    aggregateRows: [{ total: { toString: () => '5' } }],
    findRows: [{ balanceRaw: '2' }, { balanceRaw: '5' }],
    onFindFilter: (filter) => {
      capturedFilter = filter;
    },
  });
  const warnMock = mock.method(logger, 'warn', () => {});
  t.after(() => warnMock.mock.restore());

  const result = await UserBalanceRepository.sumBalanceRawForLedger({
    excludeUserIds: ['system-account'],
  });

  assert.equal(result, 5n);
  assert.deepEqual(capturedFilter, { userId: { $nin: ['system-account'] } });
  assert.equal(warnMock.mock.callCount(), 1);
  assert.equal(warnMock.mock.calls[0].arguments[0], 'user_balance.sum_mismatch');
  assert.equal(
    (warnMock.mock.calls[0].arguments[1] as { deltaRaw: string }).deltaRaw,
    '2',
  );
});
