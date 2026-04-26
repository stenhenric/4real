import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { Address } from '@ton/ton';

import { resetEnvCacheForTests } from '../config/env.ts';
import { USDT_MASTER } from '../lib/jetton.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { AuditService } from '../services/audit.service.ts';
import { generateDepositMemo } from '../services/deposit-service.ts';
import { resolveHotWalletRuntime, setHotWalletRuntimeForTests } from '../services/hot-wallet-runtime.service.ts';
import { requestWithdrawal } from '../services/withdrawal-service.ts';
import * as userServiceModule from '../services/user.service.ts';
import * as withdrawalEngineModule from '../services/withdrawal-engine.ts';
import { pollDeposits } from '../workers/deposit-poller.ts';
import {
  confirmSentWithdrawals,
  initWorker,
  resetWithdrawalWorkerStateForTests,
  setWithdrawalWorkerDependenciesForTests,
  runWithdrawalWorker,
} from '../workers/withdrawal-worker.ts';

const HOT_WALLET_ADDRESS = Address.parse(USDT_MASTER).toString({ bounceable: true });
const ZERO_ADDRESS = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').toString({ bounceable: true });
const HOT_JETTON_WALLET = ZERO_ADDRESS;

function registerBaseCleanup(t: TestContext) {
  const auditMock = mock.method(AuditService, 'record', async () => {});
  t.after(() => {
    auditMock.mock.restore();
    delete process.env.HOT_JETTON_WALLET;
    delete process.env.HOT_WALLET_MIN_USDT_BALANCE;
    process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    setHotWalletRuntimeForTests(null);
    resetWithdrawalWorkerStateForTests();
  });
}

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

function createToncenterResponse(jettonTransfers: unknown[]) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { jetton_transfers: jettonTransfers };
    },
  };
}

process.env.JWT_SECRET = 'x'.repeat(32);
process.env.NODE_ENV = 'test';
process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
resetEnvCacheForTests();

test('generateDepositMemo returns the existing shape and stores memo ownership', async (t) => {
  registerBaseCleanup(t);

  let storedDocument: Record<string, unknown> | null = null;
  const createMock = mock.method(DepositMemoRepository, 'create', async (document) => {
    storedDocument = document as Record<string, unknown>;
  });
  t.after(() => createMock.mock.restore());

  const result = await generateDepositMemo('user-123');

  assert.match(result.memo, /^d-user-123-/);
  assert.equal(result.address, HOT_WALLET_ADDRESS);
  assert.equal(result.instructions, `Send USDT to ${HOT_WALLET_ADDRESS} with comment: ${result.memo}`);
  assert.equal('deepLink' in result, false);
  assert.equal(storedDocument?.userId, 'user-123');
  assert.equal(storedDocument?.memo, result.memo);
});

test('pollDeposits ignores already processed transaction hashes', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'seen-hash',
      transaction_now: 1_700_000_001,
      comment: 'memo-1',
      jetton_master: USDT_MASTER,
      amount: '1000000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => [{ txHash: 'seen-hash' }]);
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => []);
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => markStateMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());

  await pollDeposits();

  assert.equal(memoLookupMock.mock.callCount(), 0);
  assert.equal(processedCreateMock.mock.callCount(), 0);
  assert.equal(markStateMock.mock.callCount(), 1);
  assert.equal(markStateMock.mock.calls[0].arguments[1], 1_700_000_001);
});

test('pollDeposits rejects non-USDT jetton transfers', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'fake-jetton',
      transaction_now: 1_700_000_002,
      comment: 'memo-2',
      jetton_master: ZERO_ADDRESS,
      amount: '5000000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-2', userId: 'user-2' }]);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => unmatchedMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(unmatchedMock.mock.callCount(), 0);
  assert.equal(depositCreateMock.mock.callCount(), 0);
  assert.equal(processedCreateMock.mock.callCount(), 0);
});

test('pollDeposits credits the correct user for a valid memo', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'deposit-hash',
      transaction_now: 1_700_000_003,
      comment: 'memo-3',
      jetton_master: USDT_MASTER,
      amount: '2500000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-3', userId: 'user-3' }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => ({ memo: 'memo-3', userId: 'user-3' }));
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const syncMock = mock.method(userServiceModule.UserService, 'syncUserDisplayBalance', async () => 2.5);
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => syncMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(depositCreateMock.mock.callCount(), 1);
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { userId: string }).userId, 'user-3');
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { txHash: string }).txHash, 'deposit-hash');
  assert.equal(creditMock.mock.callCount(), 1);
  assert.equal(creditMock.mock.calls[0].arguments[0], 'user-3');
  assert.equal(creditMock.mock.calls[0].arguments[1], '2500000');
  assert.equal(claimMemoMock.mock.callCount(), 1);
  assert.equal(claimMemoMock.mock.calls[0].arguments[0], 'memo-3');
});

test('pollDeposits resolves memos from decoded forward payload comments', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'deposit-hash-forward-payload',
      transaction_now: 1_700_000_031,
      jetton_master: USDT_MASTER,
      amount: '3300000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
      decoded_forward_payload: { comment: 'memo-forward' },
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-forward', userId: 'user-forward' }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => ({ memo: 'memo-forward', userId: 'user-forward' }));
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const syncMock = mock.method(userServiceModule.UserService, 'syncUserDisplayBalance', async () => 3.3);
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => syncMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(memoLookupMock.mock.callCount(), 1);
  assert.deepEqual(memoLookupMock.mock.calls[0].arguments[0], ['memo-forward']);
  assert.equal(claimMemoMock.mock.callCount(), 1);
  assert.equal(claimMemoMock.mock.calls[0].arguments[0], 'memo-forward');
  assert.equal(depositCreateMock.mock.callCount(), 1);
});

test('pollDeposits rejects expired or reused memos during execution', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'expired-memo-hash',
      transaction_now: 1_700_000_005,
      comment: 'memo-expired',
      jetton_master: USDT_MASTER,
      amount: '1500000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-expired', userId: 'user-expired' }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => null);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => unmatchedMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(claimMemoMock.mock.callCount(), 1);
  assert.equal(unmatchedMock.mock.callCount(), 1);
  assert.equal(processedCreateMock.mock.callCount(), 1);
  assert.equal((processedCreateMock.mock.calls[0].arguments[0] as { type: string }).type, 'deposit_unmatched');
  assert.equal(depositCreateMock.mock.callCount(), 0);
  assert.equal(creditMock.mock.callCount(), 0);
});

test('pollDeposits records unmatched deposits when memo resolution fails', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'unmatched-hash',
      transaction_now: 1_700_000_004,
      comment: 'memo-4',
      jetton_master: USDT_MASTER,
      amount: '4000000',
      source: ZERO_ADDRESS,
      source_owner: ZERO_ADDRESS,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => []);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => unmatchedMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(unmatchedMock.mock.callCount(), 1);
  assert.equal((unmatchedMock.mock.calls[0].arguments[0] as { txHash: string }).txHash, 'unmatched-hash');
  assert.equal(processedCreateMock.mock.callCount(), 1);
  assert.equal((processedCreateMock.mock.calls[0].arguments[0] as { type: string }).type, 'deposit_unmatched');
});

test('requestWithdrawal rejects insufficient balance', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const balanceMock = mock.method(UserBalanceRepository, 'findByUserId', async () => ({ userId: 'user-4', balanceRaw: '1000', totalDepositedRaw: '0', totalWithdrawnRaw: '0', createdAt: new Date(), updatedAt: new Date() }));
  const setBalanceMock = mock.method(UserBalanceRepository, 'setBalanceRaw', async () => {});
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});

  t.after(() => startSessionMock.mock.restore());
  t.after(() => balanceMock.mock.restore());
  t.after(() => setBalanceMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());

  await assert.rejects(
    requestWithdrawal({ userId: 'user-4', toAddress: ZERO_ADDRESS, amountUsdt: 1, withdrawalId: 'wd-1' }),
    /Insufficient balance/,
  );

  assert.equal(setBalanceMock.mock.callCount(), 0);
  assert.equal(createQueuedMock.mock.callCount(), 0);
});

test('requestWithdrawal queues a withdrawal atomically with balance deduction', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const balanceMock = mock.method(UserBalanceRepository, 'findByUserId', async () => ({ userId: 'user-5', balanceRaw: '2500000', totalDepositedRaw: '0', totalWithdrawnRaw: '0', createdAt: new Date(), updatedAt: new Date() }));
  const setBalanceMock = mock.method(UserBalanceRepository, 'setBalanceRaw', async () => {});
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const syncMock = mock.method(userServiceModule.UserService, 'syncUserDisplayBalance', async () => 1.5);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => balanceMock.mock.restore());
  t.after(() => setBalanceMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => syncMock.mock.restore());

  await requestWithdrawal({ userId: 'user-5', toAddress: ZERO_ADDRESS, amountUsdt: 1, withdrawalId: 'wd-2' });

  assert.equal(setBalanceMock.mock.callCount(), 1);
  assert.equal(setBalanceMock.mock.calls[0].arguments[1], '1500000');
  assert.equal(createQueuedMock.mock.callCount(), 1);
  assert.equal((createQueuedMock.mock.calls[0].arguments[0] as { withdrawalId: string }).withdrawalId, 'wd-2');
});

test('runWithdrawalWorker claims only one queued withdrawal at a time', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  let releaseClaim: (() => void) | null = null;
  const firstClaimStarted = new Promise<void>((resolve) => {
    releaseClaim = resolve;
  });
  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => {
    await firstClaimStarted;
    return null;
  });

  t.after(() => claimMock.mock.restore());

  const runOne = runWithdrawalWorker();
  const runTwo = runWithdrawalWorker();
  releaseClaim?.();

  await Promise.all([runOne, runTwo]);

  assert.equal(claimMock.mock.callCount(), 1);
});

test('runWithdrawalWorker marks sent withdrawals with seqno', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => ({
    _id: 'doc-1',
    withdrawalId: 'wd-3',
    userId: 'user-6',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'queued',
    createdAt: new Date(),
    retries: 0,
  }));
  const markSentMock = mock.method(WithdrawalRepository, 'markSent', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => 77,
  });

  await runWithdrawalWorker();

  assert.equal(markSentMock.mock.callCount(), 1);
  assert.equal(markSentMock.mock.calls[0].arguments[1], 77);
});

test('runWithdrawalWorker retries without refund before terminal failure and refunds only when terminal', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const queuedDocs = [
    {
      _id: 'doc-2',
      withdrawalId: 'wd-4',
      userId: 'user-7',
      toAddress: ZERO_ADDRESS,
      amountRaw: '1000000',
      amountDisplay: '1.000000',
      status: 'queued',
      createdAt: new Date(),
      retries: 1,
    },
    {
      _id: 'doc-3',
      withdrawalId: 'wd-5',
      userId: 'user-8',
      toAddress: ZERO_ADDRESS,
      amountRaw: '2000000',
      amountDisplay: '2.000000',
      status: 'queued',
      createdAt: new Date(),
      retries: 2,
    },
  ];
  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => queuedDocs.shift() ?? null);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const retryStateMock = mock.method(WithdrawalRepository, 'markRetryState', async () => {});
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const syncMock = mock.method(userServiceModule.UserService, 'syncUserDisplayBalance', async () => 0);

  t.after(() => claimMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => retryStateMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => syncMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => {
      throw new Error('send failed');
    },
  });

  await runWithdrawalWorker();
  await runWithdrawalWorker();

  assert.equal(retryStateMock.mock.callCount(), 2);
  assert.equal(retryStateMock.mock.calls[0].arguments[1], 'queued');
  assert.equal(retryStateMock.mock.calls[1].arguments[1], 'failed');
  assert.equal(refundMock.mock.callCount(), 1);
  assert.equal(refundMock.mock.calls[0].arguments[0], 'user-8');
});

test('runWithdrawalWorker does not refund seqno timeout paths', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => ({
    _id: 'doc-4',
    withdrawalId: 'wd-6',
    userId: 'user-9',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'queued',
    createdAt: new Date(),
    retries: 0,
  }));
  const timeout = new withdrawalEngineModule.SeqnoTimeoutError(19, 90_000, new Date('2026-01-01T00:00:00.000Z'));
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => {
      throw timeout;
    },
  });

  await runWithdrawalWorker();

  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 19);
  assert.equal(refundMock.mock.callCount(), 0);
});

test('confirmSentWithdrawals marks matching outbound transfers as confirmed and is idempotent', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const pendingDoc = {
    _id: 'doc-5',
    withdrawalId: 'wd-7',
    userId: 'user-10',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'sent' as const,
    createdAt: new Date(),
    sentAt: new Date('2026-01-02T00:00:00.000Z'),
    retries: 0,
  };
  let pollCount = 0;
  const pendingMock = mock.method(WithdrawalRepository, 'findPendingConfirmation', async () => [pendingDoc]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {
    pollCount += 1;
    if (pollCount > 1) {
      throw { code: 11000 };
    }
  });
  const markConfirmedMock = mock.method(WithdrawalRepository, 'markConfirmed', async () => {});
  const withdrawnMock = mock.method(UserBalanceRepository, 'recordWithdrawalConfirmed', async () => {});

  t.after(() => pendingMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => withdrawnMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => ({
      txHash: 'chain-hash-1',
      confirmedAt: new Date('2026-01-02T00:05:00.000Z'),
    }),
  });

  await confirmSentWithdrawals();
  await confirmSentWithdrawals();

  assert.equal(markConfirmedMock.mock.callCount(), 1);
  assert.equal(withdrawnMock.mock.callCount(), 1);
  assert.equal(processedCreateMock.mock.callCount(), 2);
  assert.equal(pendingDoc.toAddress, ZERO_ADDRESS);
});

test('resolveHotWalletRuntime fails on hot jetton wallet mismatch', async (t) => {
  registerBaseCleanup(t);

  process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
  process.env.HOT_JETTON_WALLET = HOT_WALLET_ADDRESS;
  resetEnvCacheForTests();

  await assert.rejects(
    resolveHotWalletRuntime({
      deriveJettonWalletFn: async () => HOT_JETTON_WALLET,
    }),
    /HOT_JETTON_WALLET mismatch/,
  );
});

test('resolveHotWalletRuntime succeeds when the derived wallet matches or HOT_JETTON_WALLET is absent', async (t) => {
  registerBaseCleanup(t);

  process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
  delete process.env.HOT_JETTON_WALLET;
  resetEnvCacheForTests();

  const derivedOnly = await resolveHotWalletRuntime({
    deriveJettonWalletFn: async () => HOT_JETTON_WALLET,
  });

  assert.equal(derivedOnly.hotJettonWallet, HOT_JETTON_WALLET);

  process.env.HOT_JETTON_WALLET = HOT_JETTON_WALLET;
  resetEnvCacheForTests();

  const matchedConfig = await resolveHotWalletRuntime({
    deriveJettonWalletFn: async () => HOT_JETTON_WALLET,
  });

  assert.equal(matchedConfig.hotJettonWallet, HOT_JETTON_WALLET);
});
