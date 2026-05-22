import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { REQUIRED_DATABASE_INDEXES } from '../lib/setup-db.ts';
import { FailedDepositIngestionRepository } from '../repositories/failed-deposit-ingestion.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';

type CapturedIndex = { key: Record<string, unknown>; unique?: boolean; sparse?: boolean };

function createCollectionMock(captured: CapturedIndex[]) {
  return {
    async createIndexes(indexes: CapturedIndex[]) {
      captured.push(...indexes);
    },
  };
}

test('withdrawal repository declares status-startedAt index for stale processing recovery', async (t) => {
  const captured: CapturedIndex[] = [];
  const collectionMock = mock.method(WithdrawalRepository as unknown as {
    collection: () => ReturnType<typeof createCollectionMock>;
  }, 'collection', () => createCollectionMock(captured));
  t.after(() => collectionMock.mock.restore());

  await WithdrawalRepository.ensureIndexes();

  assert.ok(captured.some((index) => (
    index.key.status === 1
    && index.key.startedAt === 1
  )));
});

test('failed deposit repository declares equality-first retry and pending-time indexes', async (t) => {
  const captured: CapturedIndex[] = [];
  const collectionMock = mock.method(FailedDepositIngestionRepository as unknown as {
    collection: () => ReturnType<typeof createCollectionMock>;
  }, 'collection', () => createCollectionMock(captured));
  t.after(() => collectionMock.mock.restore());

  await FailedDepositIngestionRepository.ensureIndexes();

  assert.ok(captured.some((index) => (
    index.key.status === 1
    && index.key.resolvedAt === 1
    && index.key['transferData.transaction_now'] === 1
  )));
  assert.ok(captured.some((index) => (
    index.key.status === 1
    && index.key.resolvedAt === 1
    && index.key.nextRetryAt === 1
    && index.key.failedAt === 1
  )));
  assert.equal(captured.some((index) => {
    const fields = Object.keys(index.key);
    return fields.indexOf('failedAt') >= 0
      && fields.indexOf('nextRetryAt') >= 0
      && fields.indexOf('failedAt') < fields.indexOf('nextRetryAt');
  }), false);
});

test('failed deposit repository exposes the actual snake_case collection name for explain commands', () => {
  assert.equal(
    (FailedDepositIngestionRepository as unknown as { collectionName?: string }).collectionName,
    'failed_deposit_ingestions',
  );
});

test('startup index verification covers staging-required query indexes', () => {
  assert.deepEqual(
    REQUIRED_DATABASE_INDEXES.map((index) => `${index.collection}.${index.name}`).sort(),
    [
      'failed_deposit_ingestions.status_1_resolvedAt_1_nextRetryAt_1_failedAt_1',
      'failed_deposit_ingestions.status_1_resolvedAt_1_transferData.transaction_now_1',
      'orders.createdAt_-1',
      'orders.status_1_type_1_createdAt_-1',
      'orders.type_1_createdAt_-1',
      'transactions.createdAt_-1__id_-1',
      'users.leaderboard_public_by_elo',
      'withdrawals.status_1_startedAt_1',
    ],
  );
});
