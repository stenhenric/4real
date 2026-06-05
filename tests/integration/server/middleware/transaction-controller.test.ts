import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  getAllTransactions,
  getDepositStatusHandler,
  getUserTransactions,
  getWithdrawalStatusHandler,
} from '../../../../server/controllers/transaction.controller.ts';
import { Transaction } from '../../../../server/models/Transaction.ts';
import { DepositMemoRepository } from '../../../../server/repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../../../../server/repositories/deposit.repository.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';

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

test('getDepositStatusHandler returns pending status for an active user memo', async (t) => {
  const depositLookupMock = mock.method(DepositRepository, 'findByUserAndMemo', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByUserAndMemo', async () => ({
    userId: 'user-1',
    memo: 'memo-user-1',
    createdAt: new Date('2026-06-06T08:00:00.000Z'),
    expiresAt: new Date('2099-06-06T08:15:00.000Z'),
  }));
  t.after(() => depositLookupMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());

  const req = {
    params: { memo: 'memo-user-1' },
    user: { id: 'user-1' },
  };
  const res = createResponseMock();

  await getDepositStatusHandler(req as any, res as any);

  assert.equal(depositLookupMock.mock.callCount(), 1);
  assert.deepEqual(res.payload, {
    memo: 'memo-user-1',
    status: 'pending',
    expiresAt: '2099-06-06T08:15:00.000Z',
  });
});

test('getDepositStatusHandler returns confirmed deposit details for the current user memo', async (t) => {
  const depositLookupMock = mock.method(DepositRepository, 'findByUserAndMemo', async () => ({
    txHash: 'tx-confirmed',
    userId: 'user-1',
    amountRaw: '12340000',
    amountDisplay: '12.340000',
    comment: 'memo-user-1',
    senderJettonWallet: 'EQSenderJetton',
    senderAddress: 'EQSenderOwner',
    txTime: new Date('2026-06-06T08:01:00.000Z'),
    status: 'confirmed' as const,
    createdAt: new Date('2026-06-06T08:01:05.000Z'),
  }));
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByUserAndMemo', async () => {
    throw new Error('memo lookup should not be needed after confirmation');
  });
  t.after(() => depositLookupMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());

  const req = {
    params: { memo: 'memo-user-1' },
    user: { id: 'user-1' },
  };
  const res = createResponseMock();

  await getDepositStatusHandler(req as any, res as any);

  assert.equal(memoLookupMock.mock.callCount(), 0);
  assert.deepEqual(res.payload, {
    memo: 'memo-user-1',
    status: 'confirmed',
    amountUsdt: '12.340000',
    txHash: 'tx-confirmed',
    confirmedAt: '2026-06-06T08:01:00.000Z',
  });
});

test('getWithdrawalStatusHandler returns a generic public error for stuck withdrawals', async (t) => {
  const rawProviderError = 'Toncenter request failed: https://toncenter.example/api/v3?api_key=secret stack=WalletSendError';
  const lookupMock = mock.method(WithdrawalRepository, 'findByWithdrawalIdForUser', async () => ({
    withdrawalId: 'withdrawal-1',
    userId: 'user-1',
    toAddress: 'EQDestination',
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'stuck',
    createdAt: new Date('2026-05-03T00:00:00.000Z'),
    updatedAt: new Date('2026-05-03T00:05:00.000Z'),
    retries: 2,
    lastError: rawProviderError,
  }));
  t.after(() => lookupMock.mock.restore());

  const req = {
    params: { withdrawalId: 'withdrawal-1' },
    user: { id: 'user-1' },
  };
  const res = createResponseMock();

  await getWithdrawalStatusHandler(req as any, res as any);

  assert.equal(lookupMock.mock.callCount(), 1);
  assert.equal((res.payload as { lastError?: string }).lastError, 'Withdrawal confirmation is taking longer than expected and is under review.');
  assert.equal(JSON.stringify(res.payload).includes(rawProviderError), false);
  assert.equal(JSON.stringify(res.payload).includes('api_key=secret'), false);
});

test('getWithdrawalStatusHandler returns a generic public error for failed withdrawals', async (t) => {
  const rawProviderError = 'send failed: seqno timeout from hot wallet shard';
  const lookupMock = mock.method(WithdrawalRepository, 'findByWithdrawalIdForUser', async () => ({
    withdrawalId: 'withdrawal-2',
    userId: 'user-1',
    toAddress: 'EQDestination',
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'failed',
    createdAt: new Date('2026-05-03T00:00:00.000Z'),
    updatedAt: new Date('2026-05-03T00:05:00.000Z'),
    retries: 3,
    lastError: rawProviderError,
  }));
  t.after(() => lookupMock.mock.restore());

  const req = {
    params: { withdrawalId: 'withdrawal-2' },
    user: { id: 'user-1' },
  };
  const res = createResponseMock();

  await getWithdrawalStatusHandler(req as any, res as any);

  assert.equal((res.payload as { lastError?: string }).lastError, 'Withdrawal processing failed after retries. Your held balance was refunded.');
  assert.equal(JSON.stringify(res.payload).includes(rawProviderError), false);
});

test('getWithdrawalStatusHandler omits raw retry errors for queued withdrawals', async (t) => {
  const lookupMock = mock.method(WithdrawalRepository, 'findByWithdrawalIdForUser', async () => ({
    withdrawalId: 'withdrawal-3',
    userId: 'user-1',
    toAddress: 'EQDestination',
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'queued',
    createdAt: new Date('2026-05-03T00:00:00.000Z'),
    updatedAt: new Date('2026-05-03T00:05:00.000Z'),
    retries: 1,
    lastError: 'temporary provider outage at internal dependency',
  }));
  t.after(() => lookupMock.mock.restore());

  const req = {
    params: { withdrawalId: 'withdrawal-3' },
    user: { id: 'user-1' },
  };
  const res = createResponseMock();

  await getWithdrawalStatusHandler(req as any, res as any);

  assert.equal('lastError' in (res.payload as object), false);
});

test('transaction schema declares createdAt index for admin chronological listing', () => {
  const indexes = Transaction.schema.indexes().map(([fields]) => fields);

  assert.ok(indexes.some((fields) => (
    fields.createdAt === -1
    && fields._id === -1
  )));
});
