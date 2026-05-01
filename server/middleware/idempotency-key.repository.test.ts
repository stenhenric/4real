import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';

import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';

interface CapturedUpdate {
  $set?: {
    updatedAt?: unknown;
  };
  $setOnInsert?: Record<string, unknown> & {
    createdAt?: unknown;
  };
}

test('claimOrGetExisting keeps updatedAt out of $setOnInsert to avoid Mongo path conflicts', async (t: TestContext) => {
  const captured: {
    filter?: Record<string, unknown>;
    update?: CapturedUpdate;
    options?: Record<string, unknown>;
  } = {};

  const collectionMock = {
    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: CapturedUpdate,
      options: Record<string, unknown>,
    ): Promise<null> {
      captured.filter = filter;
      captured.update = update;
      captured.options = options;
      return null;
    },
  };

  const repository = IdempotencyKeyRepository as unknown as {
    collection: () => typeof collectionMock;
  };
  const collectionMethodMock = mock.method(repository, 'collection', () => collectionMock);
  t.after(() => collectionMethodMock.mock.restore());

  await IdempotencyKeyRepository.claimOrGetExisting({
    userId: 'user-1',
    routeKey: 'matches:create',
    idempotencyKey: 'idem-1',
    requestHash: 'hash-1',
  });

  assert.deepEqual(captured.filter, {
    userId: 'user-1',
    routeKey: 'matches:create',
    idempotencyKey: 'idem-1',
  });
  assert.ok(captured.update);
  assert.equal(captured.update.$set?.updatedAt instanceof Date, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      captured.update.$setOnInsert ?? {},
      'updatedAt',
    ),
    false,
  );
  assert.equal(captured.update.$setOnInsert?.createdAt instanceof Date, true);
  assert.deepEqual(captured.options, {
    upsert: true,
    returnDocument: 'before',
  });
});
