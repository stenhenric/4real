import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { Address } from '@ton/ton';

import { resetEnvCacheForTests } from '../config/env.ts';
import { USDT_MASTER } from '../lib/jetton.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import {
  FailedDepositIngestionRepository,
  type FailedDepositIngestionDocument,
} from '../repositories/failed-deposit-ingestion.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { AuditService } from '../services/audit.service.ts';
import { generateDepositMemo } from '../services/deposit-service.ts';
import { resolveHotWalletRuntime, setHotWalletRuntimeForTests } from '../services/hot-wallet-runtime.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { requestWithdrawal } from '../services/withdrawal-service.ts';
import { LockUnavailableError } from '../services/distributed-lock.service.ts';
import type { JettonTransferEvent } from '../services/deposit-ingestion.service.ts';
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
import {
  resetFailedDepositReplayWorkerForTests,
  runFailedDepositReplayWorker,
  setFailedDepositReplayWorkerDependenciesForTests,
} from '../workers/failed-deposit-replay-worker.ts';
import { logger } from '../utils/logger.ts';

const HOT_WALLET_ADDRESS = Address.parse(USDT_MASTER).toString({ bounceable: true });
const HOT_WALLET_RAW = Address.parse(USDT_MASTER).toRawString();
const ZERO_ADDRESS = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').toString({ bounceable: true });
const HOT_JETTON_WALLET = ZERO_ADDRESS;
const SENDER_JETTON_WALLET = HOT_WALLET_ADDRESS;

function registerBaseCleanup(t: TestContext) {
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const findFailedByHashesMock = mock.method(FailedDepositIngestionRepository, 'findByTxHashes', async () => []);
  const findEarliestPendingMock = mock.method(
    FailedDepositIngestionRepository,
    'findEarliestPendingTransactionTime',
    async () => null,
  );
  const upsertFailedIngestionMock = mock.method(FailedDepositIngestionRepository, 'upsertFailure', async () => {});
  setWithdrawalWorkerDependenciesForTests({
    withLock: async (_resource, _ttlMs, fn) => fn(),
  });

  t.after(() => {
    try {
      auditMock.mock.restore();
    } catch {}
    try {
      findFailedByHashesMock.mock.restore();
    } catch {}
    try {
      findEarliestPendingMock.mock.restore();
    } catch {}
    try {
      upsertFailedIngestionMock.mock.restore();
    } catch {}
    delete process.env.HOT_JETTON_WALLET;
    delete process.env.HOT_WALLET_MIN_USDT_BALANCE;
    delete process.env.DEPOSIT_INGESTION_MAX_RETRIES;
    process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    setHotWalletRuntimeForTests(null);
    resetWithdrawalWorkerStateForTests();
    resetFailedDepositReplayWorkerForTests();
  });

  return {
    auditMock,
    findFailedByHashesMock,
    findEarliestPendingMock,
    upsertFailedIngestionMock,
  };
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

test('generateDepositMemo normalizes a raw HOT_WALLET_ADDRESS before returning it', async (t) => {
  registerBaseCleanup(t);
  process.env.HOT_WALLET_ADDRESS = HOT_WALLET_RAW;
  resetEnvCacheForTests();

  const createMock = mock.method(DepositMemoRepository, 'create', async () => {});
  t.after(() => createMock.mock.restore());

  const result = await generateDepositMemo('user-raw-address');

  assert.equal(result.address, HOT_WALLET_ADDRESS);
  assert.equal(result.instructions, `Send USDT to ${HOT_WALLET_ADDRESS} with comment: ${result.memo}`);
});

test('generateDepositMemo fails fast when the hot wallet is not configured and does not persist a memo', async (t) => {
  registerBaseCleanup(t);

  delete process.env.HOT_WALLET_ADDRESS;
  resetEnvCacheForTests();

  const createMock = mock.method(DepositMemoRepository, 'create', async () => {});
  t.after(() => createMock.mock.restore());

  await assert.rejects(
    generateDepositMemo('user-404'),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 503);
      assert.equal((error as { code?: string }).code, 'HOT_WALLET_NOT_CONFIGURED');
      return true;
    },
  );

  assert.equal(createMock.mock.callCount(), 0);
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
      source_wallet: SENDER_JETTON_WALLET,
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

test('pollDeposits queries Toncenter using the hot wallet owner address', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  let requestedUrl: URL | null = null;
  const fetchMock = mock.method(globalThis, 'fetch', async (input) => {
    requestedUrl = new URL(String(input));
    return createToncenterResponse([]) as Response;
  });
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());

  await pollDeposits();

  assert.ok(requestedUrl);
  assert.equal(requestedUrl.searchParams.get('owner_address'), HOT_WALLET_ADDRESS);
  assert.notEqual(requestedUrl.searchParams.get('owner_address'), HOT_JETTON_WALLET);
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
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-2', userId: 'user-2' }]);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
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
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-3', userId: 'user-3' }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => ({ memo: 'memo-3', userId: 'user-3' }));
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(depositCreateMock.mock.callCount(), 1);
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { userId: string }).userId, 'user-3');
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { txHash: string }).txHash, 'deposit-hash');
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { senderJettonWallet: string }).senderJettonWallet, SENDER_JETTON_WALLET);
  assert.equal((depositCreateMock.mock.calls[0].arguments[0] as { senderAddress: string }).senderAddress, ZERO_ADDRESS);
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
      source_wallet: SENDER_JETTON_WALLET,
      decoded_forward_payload: { comment: 'memo-forward' },
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [{ memo: 'memo-forward', userId: 'user-forward' }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => ({ memo: 'memo-forward', userId: 'user-forward' }));
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(memoLookupMock.mock.callCount(), 1);
  assert.deepEqual(memoLookupMock.mock.calls[0].arguments[0], ['memo-forward']);
  assert.equal(claimMemoMock.mock.callCount(), 1);
  assert.equal(claimMemoMock.mock.calls[0].arguments[0], 'memo-forward');
  assert.equal(depositCreateMock.mock.callCount(), 1);
});

test('findWithdrawalTransferOnChain queries Toncenter using the hot wallet owner address', async (t) => {
  registerBaseCleanup(t);

  let requestedUrl: URL | null = null;
  const fetchMock = mock.method(globalThis, 'fetch', async (input) => {
    requestedUrl = new URL(String(input));
    return createToncenterResponse([]) as Response;
  });

  t.after(() => fetchMock.mock.restore());

  const result = await withdrawalEngineModule.findWithdrawalTransferOnChain({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    sentAt: new Date('2026-04-26T22:00:00.000Z'),
    withdrawalId: 'wd-owner-address',
    amountRaw: '1000000',
    toAddress: ZERO_ADDRESS,
  });

  assert.equal(result, null);
  assert.ok(requestedUrl);
  assert.equal(requestedUrl.searchParams.get('owner_address'), HOT_WALLET_ADDRESS);
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
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
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
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
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
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({ key: 'deposit_poller', lastProcessedTime: 1_700_000_000, updatedAt: new Date() }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => []);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
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

test('transient ingestion failure keeps cursor pinned and replay succeeds on second attempt', async (t) => {
  const {
    findFailedByHashesMock,
    findEarliestPendingMock,
    upsertFailedIngestionMock,
  } = registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  let failedRecord: FailedDepositIngestionDocument | null = null;
  findFailedByHashesMock.mock.restore();
  const findFailedByHashesCustomMock = mock.method(
    FailedDepositIngestionRepository,
    'findByTxHashes',
    async () => (failedRecord ? [failedRecord] : []),
  );
  t.after(() => findFailedByHashesCustomMock.mock.restore());

  findEarliestPendingMock.mock.restore();
  const findEarliestPendingCustomMock = mock.method(
    FailedDepositIngestionRepository,
    'findEarliestPendingTransactionTime',
    async () => (
      failedRecord && failedRecord.status === 'pending' && failedRecord.resolvedAt === null
        ? failedRecord.transferData.transaction_now
        : null
    ),
  );
  t.after(() => findEarliestPendingCustomMock.mock.restore());

  upsertFailedIngestionMock.mock.restore();
  const upsertFailureCustomMock = mock.method(FailedDepositIngestionRepository, 'upsertFailure', async (params) => {
    const now = new Date();
    failedRecord = {
      txHash: params.txHash,
      transferData: params.transferData,
      failedAt: now,
      retryCount: failedRecord?.retryCount ?? 0,
      lastError: params.lastError,
      status: 'pending',
      nextRetryAt: failedRecord?.nextRetryAt ?? now,
      resolvedAt: null,
      terminalFailureAt: null,
      updatedAt: now,
    };
  });
  t.after(() => upsertFailureCustomMock.mock.restore());

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'transient-failure-hash',
      transaction_now: 1_700_000_010,
      comment: 'memo-transient-failure',
      jetton_master: USDT_MASTER,
      amount: '1000000',
      source: ZERO_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
    },
    {
      transaction_hash: 'transient-success-hash',
      transaction_now: 1_700_000_020,
      comment: 'memo-transient-success',
      jetton_master: USDT_MASTER,
      amount: '2000000',
      source: ZERO_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({
    key: 'deposit_poller',
    lastProcessedTime: 1_700_000_000,
    updatedAt: new Date(),
  }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findByHashMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async (memos) =>
    memos[0] === 'memo-transient-failure'
      ? [{ memo: 'memo-transient-failure', userId: 'user-failed' }]
      : [{ memo: 'memo-transient-success', userId: 'user-success' }],
  );
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async (memo) => {
    if (memo === 'memo-transient-failure') {
      throw new Error('temporary ingest error');
    }

    return { memo: 'memo-transient-success', userId: 'user-success' };
  });
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const depositCreateMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => findByHashMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => depositCreateMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(upsertFailureCustomMock.mock.callCount(), 1);
  assert.equal(
    (upsertFailureCustomMock.mock.calls[0].arguments[0] as { txHash: string }).txHash,
    'transient-failure-hash',
  );
  assert.equal(markStateMock.mock.callCount(), 1);
  assert.equal(markStateMock.mock.calls[0].arguments[1], 1_700_000_010);
  assert.ok(failedRecord);
  assert.equal(failedRecord.status, 'pending');

  const findRetryableMock = mock.method(
    FailedDepositIngestionRepository,
    'findRetryable',
    async () => (
      failedRecord && failedRecord.status === 'pending' && failedRecord.resolvedAt === null
        ? [failedRecord]
        : []
    ),
  );
  const markRetryScheduledMock = mock.method(
    FailedDepositIngestionRepository,
    'markRetryScheduled',
    async (params) => {
      if (!failedRecord || failedRecord.txHash !== params.txHash) {
        return;
      }

      failedRecord = {
        ...failedRecord,
        retryCount: params.retryCount,
        lastError: params.lastError,
        nextRetryAt: new Date(0),
        updatedAt: new Date(),
      };
    },
  );
  const markResolvedMock = mock.method(FailedDepositIngestionRepository, 'markResolved', async (txHash) => {
    if (!failedRecord || failedRecord.txHash !== txHash) {
      return;
    }

    failedRecord = {
      ...failedRecord,
      status: 'resolved',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    };
  });
  const markTerminalFailureMock = mock.method(
    FailedDepositIngestionRepository,
    'markTerminalFailure',
    async () => {},
  );

  t.after(() => findRetryableMock.mock.restore());
  t.after(() => markRetryScheduledMock.mock.restore());
  t.after(() => markResolvedMock.mock.restore());
  t.after(() => markTerminalFailureMock.mock.restore());

  let replayAttemptCount = 0;
  setFailedDepositReplayWorkerDependenciesForTests({
    ingestIncomingTransfer: async (_tx: JettonTransferEvent) => {
      replayAttemptCount += 1;
      if (replayAttemptCount === 1) {
        throw new Error('replay temporary failure');
      }

      return {
        txHash: 'transient-failure-hash',
        decision: 'credit',
        amountRaw: '1000000',
        amountUsdt: 1,
        comment: 'memo-transient-failure',
        memoStatus: 'active',
        candidateUserId: 'user-failed',
        senderJettonWallet: SENDER_JETTON_WALLET,
        senderOwnerAddress: ZERO_ADDRESS,
        txTime: new Date().toISOString(),
      };
    },
  });

  await runFailedDepositReplayWorker();
  assert.ok(failedRecord);
  assert.equal(failedRecord.status, 'pending');
  assert.equal(failedRecord.retryCount, 1);

  await runFailedDepositReplayWorker();
  assert.ok(failedRecord);
  assert.equal(failedRecord.status, 'resolved');
  assert.ok(failedRecord.resolvedAt instanceof Date);
  assert.equal(replayAttemptCount, 2);
});

test('terminal replay failure emits alert, marks record, and allows cursor to move on', async (t) => {
  const {
    findFailedByHashesMock,
    findEarliestPendingMock,
    upsertFailedIngestionMock,
  } = registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  process.env.DEPOSIT_INGESTION_MAX_RETRIES = '2';
  resetEnvCacheForTests();

  let failedRecord: FailedDepositIngestionDocument = {
    txHash: 'terminal-hash',
    transferData: {
      transaction_hash: 'terminal-hash',
      transaction_now: 1_700_000_030,
      comment: 'memo-terminal',
      jetton_master: USDT_MASTER,
      amount: '1000000',
      source: ZERO_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
    },
    failedAt: new Date(),
    retryCount: 1,
    lastError: 'initial failure',
    status: 'pending',
    nextRetryAt: new Date(0),
    resolvedAt: null,
    terminalFailureAt: null,
    updatedAt: new Date(),
  };

  const findRetryableMock = mock.method(
    FailedDepositIngestionRepository,
    'findRetryable',
    async () => (failedRecord.status === 'pending' ? [failedRecord] : []),
  );
  const markTerminalFailureMock = mock.method(
    FailedDepositIngestionRepository,
    'markTerminalFailure',
    async (params) => {
      failedRecord = {
        ...failedRecord,
        status: 'terminal_failure',
        retryCount: params.retryCount,
        lastError: params.lastError,
        terminalFailureAt: new Date(),
        updatedAt: new Date(),
      };
    },
  );
  const markResolvedMock = mock.method(FailedDepositIngestionRepository, 'markResolved', async () => {});
  const markRetryScheduledMock = mock.method(FailedDepositIngestionRepository, 'markRetryScheduled', async () => {});

  t.after(() => findRetryableMock.mock.restore());
  t.after(() => markTerminalFailureMock.mock.restore());
  t.after(() => markResolvedMock.mock.restore());
  t.after(() => markRetryScheduledMock.mock.restore());

  const loggerErrorMock = mock.method(logger, 'error', (_message: string, _context?: Record<string, unknown>) => {});
  t.after(() => loggerErrorMock.mock.restore());

  setFailedDepositReplayWorkerDependenciesForTests({
    ingestIncomingTransfer: async () => {
      throw new Error('still failing');
    },
  });

  await runFailedDepositReplayWorker();

  assert.equal(failedRecord.status, 'terminal_failure');
  assert.equal(loggerErrorMock.mock.callCount(), 1);
  const alertContext = loggerErrorMock.mock.calls[0].arguments[1] as { alert?: string; txHash?: string } | undefined;
  assert.equal(alertContext?.alert, 'deposit_unrecoverable');
  assert.equal(alertContext?.txHash, 'terminal-hash');

  findFailedByHashesMock.mock.restore();
  const findFailedByHashesCustomMock = mock.method(
    FailedDepositIngestionRepository,
    'findByTxHashes',
    async (txHashes) => txHashes.includes('terminal-hash') ? [failedRecord] : [],
  );
  t.after(() => findFailedByHashesCustomMock.mock.restore());

  findEarliestPendingMock.mock.restore();
  const findEarliestPendingCustomMock = mock.method(
    FailedDepositIngestionRepository,
    'findEarliestPendingTransactionTime',
    async () => null,
  );
  t.after(() => findEarliestPendingCustomMock.mock.restore());

  let upsertCalled = false;
  upsertFailedIngestionMock.mock.restore();
  const upsertFailureCustomMock = mock.method(FailedDepositIngestionRepository, 'upsertFailure', async () => {
    upsertCalled = true;
  });
  t.after(() => upsertFailureCustomMock.mock.restore());

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'terminal-hash',
      transaction_now: 1_700_000_030,
      comment: 'memo-terminal',
      jetton_master: USDT_MASTER,
      amount: '1000000',
      source: ZERO_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
    },
    {
      transaction_hash: 'latest-seen',
      transaction_now: 1_700_000_040,
      comment: 'memo-latest',
      jetton_master: USDT_MASTER,
      amount: '1000000',
      source: ZERO_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
    },
  ]) as Response);
  const findStateMock = mock.method(PollerStateRepository, 'findByKey', async () => ({
    key: 'deposit_poller',
    lastProcessedTime: 1_700_000_000,
    updatedAt: new Date(),
  }));
  const seenMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => [{ txHash: 'latest-seen' }]);
  const markStateMock = mock.method(PollerStateRepository, 'setLastProcessedTime', async () => {});

  t.after(() => fetchMock.mock.restore());
  t.after(() => findStateMock.mock.restore());
  t.after(() => seenMock.mock.restore());
  t.after(() => markStateMock.mock.restore());

  await pollDeposits();

  assert.equal(upsertCalled, false);
  assert.equal(markStateMock.mock.callCount(), 1);
  assert.equal(markStateMock.mock.calls[0].arguments[1], 1_700_000_040);
});

test('requestWithdrawal rejects insufficient balance', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => null);
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumConfirmedRawBetween', async () => 0n);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());

  await assert.rejects(
    requestWithdrawal({ userId: 'user-4', toAddress: ZERO_ADDRESS, amountUsdt: 1, withdrawalId: 'wd-1' }),
    /Insufficient balance/,
  );

  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(createQueuedMock.mock.callCount(), 0);
});

test('requestWithdrawal queues a withdrawal atomically with balance deduction', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => ({ _id: 'user-5' } as any));
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumConfirmedRawBetween', async () => 0n);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());

  await requestWithdrawal({ userId: 'user-5', toAddress: ZERO_ADDRESS, amountUsdt: 1, withdrawalId: 'wd-2' });

  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(createQueuedMock.mock.callCount(), 1);
  assert.equal((createQueuedMock.mock.calls[0].arguments[0] as { withdrawalId: string }).withdrawalId, 'wd-2');
});

test('runWithdrawalWorker claims only one queued withdrawal at a time', async (t) => {
  registerBaseCleanup(t);
  process.env.FEATURE_DISTRIBUTED_LOCK = 'true';
  resetEnvCacheForTests();
  t.after(() => {
    delete process.env.FEATURE_DISTRIBUTED_LOCK;
    resetEnvCacheForTests();
  });
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  let releaseFirstLock: (() => void) | null = null;
  const firstLockHeld = new Promise<void>((resolve) => {
    releaseFirstLock = resolve;
  });
  let lockCallCount = 0;
  setWithdrawalWorkerDependenciesForTests({
    withLock: async (_resource, _ttlMs, fn) => {
      lockCallCount += 1;
      if (lockCallCount === 1) {
        await firstLockHeld;
        return fn();
      }
      throw new LockUnavailableError('wallet-send:test');
    },
  });
  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => {
    return null;
  });

  t.after(() => claimMock.mock.restore());

  const runOne = runWithdrawalWorker();
  const runTwo = runWithdrawalWorker();
  releaseFirstLock?.();

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
    sendUsdtWithdrawal: async () => ({
      seqno: 77,
      sentAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  });

  await runWithdrawalWorker();

  assert.equal(markSentMock.mock.callCount(), 1);
  assert.equal(markSentMock.mock.calls[0].arguments[1], 77);
  assert.equal(
    (markSentMock.mock.calls[0].arguments[2] as Date).toISOString(),
    '2026-01-01T00:00:00.000Z',
  );
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
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-refund' } as any));

  t.after(() => claimMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => retryStateMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
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
  assert.equal(createTransactionMock.mock.callCount(), 1);
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { type: string }).type, 'WITHDRAW_REFUND');
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { amount: number }).amount, 2);
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

test('runWithdrawalWorker marks submitted withdrawals as stuck when markSent fails and never refunds them', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const sentAt = new Date('2026-01-03T00:00:00.000Z');
  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => ({
    _id: 'doc-4b',
    withdrawalId: 'wd-6b',
    userId: 'user-9b',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'queued',
    createdAt: new Date(),
    retries: 0,
  }));
  const markSentMock = mock.method(WithdrawalRepository, 'markSent', async () => {
    throw new Error('write failed');
  });
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-post-send' } as any));

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => ({
      seqno: 91,
      sentAt,
    }),
  });

  await runWithdrawalWorker();

  assert.equal(markSentMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 91);
  assert.equal((markStuckMock.mock.calls[0].arguments[3] as Date).toISOString(), sentAt.toISOString());
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(createTransactionMock.mock.callCount(), 0);
});

test('runWithdrawalWorker marks submitted withdrawals as stuck when audit persistence fails and never refunds them', async (t) => {
  const { auditMock } = registerBaseCleanup(t);
  auditMock.mock.restore();
  const failingAuditMock = mock.method(AuditService, 'record', async () => {
    throw new Error('audit failed');
  });
  t.after(() => failingAuditMock.mock.restore());

  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const sentAt = new Date('2026-01-04T00:00:00.000Z');
  const claimMock = mock.method(WithdrawalRepository, 'claimNextQueued', async () => ({
    _id: 'doc-4c',
    withdrawalId: 'wd-6c',
    userId: 'user-9c',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'queued',
    createdAt: new Date(),
    retries: 0,
  }));
  const markSentMock = mock.method(WithdrawalRepository, 'markSent', async () => {});
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-audit-post-send' } as any));

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => ({
      seqno: 92,
      sentAt,
    }),
  });

  await runWithdrawalWorker();

  assert.equal(markSentMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 92);
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(createTransactionMock.mock.callCount(), 0);
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

test('confirmSentWithdrawals leaves long-pending submitted withdrawals in a stuck state instead of refunding them', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const pendingMock = mock.method(WithdrawalRepository, 'findPendingConfirmation', async () => [{
    _id: 'doc-8',
    withdrawalId: 'wd-8',
    userId: 'user-11',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'sent' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sentAt: new Date('2026-01-01T00:00:00.000Z'),
    seqno: 18,
    retries: 0,
  }]);
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const refundMock = mock.method(UserBalanceRepository, 'refundWithdrawal', async () => {});

  t.after(() => pendingMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => null,
  });

  await confirmSentWithdrawals();

  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 18);
  assert.equal(refundMock.mock.callCount(), 0);
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
