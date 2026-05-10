import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { getAllTransactions, getUserTransactions } from '../controllers/transaction.controller.ts';
import { TransactionService } from '../services/transaction.service.ts';

function createResponseMock() {
  return {
    payload: undefined as unknown,
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

test('getUserTransactions bounds page and pageSize before fetching the unified feed', async (t) => {
  let capturedArgs: unknown[] | undefined;
  const serviceMock = mock.method(
    TransactionService,
    'getUnifiedTransactionsByUser',
    async (...args: unknown[]) => {
      capturedArgs = args;
      return { items: [], page: args[1], pageSize: args[2], total: 0 };
    },
  );

  t.after(() => serviceMock.mock.restore());

  const req = {
    query: {
      page: '999999',
      pageSize: '999',
    },
    user: {
      id: 'user-1',
    },
  };
  const res = createResponseMock();

  await getUserTransactions(req as any, res as any);

  assert.deepEqual(capturedArgs, ['user-1', 100, 100]);
  assert.deepEqual(res.payload, { items: [], page: 100, pageSize: 100, total: 0 });
});

test('getAllTransactions bounds limit and offset before fetching admin transactions', async (t) => {
  let capturedArgs: unknown[] | undefined;
  const serviceMock = mock.method(TransactionService, 'getAllTransactions', async (...args: unknown[]) => {
    capturedArgs = args;
    return [];
  });

  t.after(() => serviceMock.mock.restore());

  const req = {
    query: {
      limit: '9999',
      offset: '999999999',
    },
  };
  const res = createResponseMock();

  await getAllTransactions(req as any, res as any);

  assert.deepEqual(capturedArgs, [500, 10_000]);
  assert.deepEqual(res.payload, []);
});
