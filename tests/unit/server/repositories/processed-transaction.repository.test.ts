import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { ProcessedTransactionRepository } from '../../../../server/repositories/processed-transaction.repository.ts';

type CapturedIndex = {
  key: Record<string, number>;
  unique?: boolean;
  expireAfterSeconds?: number;
};

test('ensureIndexes keeps processed transaction dedupe records durable', async (t) => {
  let capturedIndexes: CapturedIndex[] = [];
  const collectionMock = {
    async indexes() {
      return [];
    },
    async createIndexes(indexes: CapturedIndex[]) {
      capturedIndexes = indexes;
    },
    async dropIndex(_name: string) {
      throw new Error('dropIndex should not be called');
    },
  };
  const repository = ProcessedTransactionRepository as unknown as {
    collection: () => typeof collectionMock;
  };
  const collectionMethodMock = mock.method(repository, 'collection', () => collectionMock);
  t.after(() => collectionMethodMock.mock.restore());

  await ProcessedTransactionRepository.ensureIndexes();

  assert.equal(capturedIndexes.some((index) => index.expireAfterSeconds !== undefined), false);
  assert.deepEqual(capturedIndexes, [
    { key: { txHash: 1 }, unique: true },
    { key: { processedAt: 1 } },
  ]);
});

test('ensureIndexes drops the legacy processedAt TTL index if present', async (t) => {
  const droppedIndexes: string[] = [];
  const collectionMock = {
    async indexes() {
      return [
        { name: '_id_', key: { _id: 1 } },
        { name: 'txHash_1', key: { txHash: 1 }, unique: true },
        { name: 'processedAt_1', key: { processedAt: 1 }, expireAfterSeconds: 7_776_000 },
      ];
    },
    async createIndexes(_indexes: CapturedIndex[]) {
      return undefined;
    },
    async dropIndex(name: string) {
      droppedIndexes.push(name);
    },
  };
  const repository = ProcessedTransactionRepository as unknown as {
    collection: () => typeof collectionMock;
  };
  const collectionMethodMock = mock.method(repository, 'collection', () => collectionMock);
  t.after(() => collectionMethodMock.mock.restore());

  await ProcessedTransactionRepository.ensureIndexes();

  assert.deepEqual(droppedIndexes, ['processedAt_1']);
});

test('ensureIndexes creates indexes when the collection namespace does not exist yet', async (t) => {
  let capturedIndexes: CapturedIndex[] = [];
  const collectionMock = {
    async indexes() {
      const error = new Error('ns does not exist') as Error & { code?: number };
      error.code = 26;
      throw error;
    },
    async createIndexes(indexes: CapturedIndex[]) {
      capturedIndexes = indexes;
    },
    async dropIndex(_name: string) {
      throw new Error('dropIndex should not be called');
    },
  };
  const repository = ProcessedTransactionRepository as unknown as {
    collection: () => typeof collectionMock;
  };
  const collectionMethodMock = mock.method(repository, 'collection', () => collectionMock);
  t.after(() => collectionMethodMock.mock.restore());

  await ProcessedTransactionRepository.ensureIndexes();

  assert.deepEqual(capturedIndexes, [
    { key: { txHash: 1 }, unique: true },
    { key: { processedAt: 1 } },
  ]);
});
