import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { Address } from '@ton/ton';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { USDT_MASTER } from '../../../../server/lib/jetton.ts';
import { DepositMemoRepository } from '../../../../server/repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../../../../server/repositories/deposit.repository.ts';
import {
  FailedDepositIngestionRepository,
  type FailedDepositIngestionDocument,
} from '../../../../server/repositories/failed-deposit-ingestion.repository.ts';
import { PollerStateRepository } from '../../../../server/repositories/poller-state.repository.ts';
import { IdempotencyKeyRepository } from '../../../../server/repositories/idempotency-key.repository.ts';
import { ProcessedTransactionRepository } from '../../../../server/repositories/processed-transaction.repository.ts';
import { UnmatchedDepositRepository } from '../../../../server/repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../../../../server/repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { requestWithdrawalHandler } from '../../../../server/controllers/transaction.controller.ts';
import { AuditService } from '../../../../server/services/audit.service.ts';
import { CacheKeys, getOrPopulateJson, resetCacheServiceForTests } from '../../../../server/services/cache.service.ts';
import { generateDepositMemo } from '../../../../server/services/deposit-service.ts';
import { resolveHotWalletRuntime, setHotWalletRuntimeForTests } from '../../../../server/services/hot-wallet-runtime.service.ts';
import {
  ProductEmailNotificationService,
  resetProductEmailNotificationDependenciesForTests,
  setProductEmailNotificationDependenciesForTests,
} from '../../../../server/services/product-email-notification.service.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';
import { requestWithdrawal } from '../../../../server/services/withdrawal-service.ts';
import { LockUnavailableError } from '../../../../server/services/distributed-lock.service.ts';
import type { JettonTransferEvent, TransferLookupContext } from '../../../../server/services/deposit-ingestion.service.ts';
import * as userServiceModule from '../../../../server/services/user.service.ts';
import * as withdrawalEngineModule from '../../../../server/services/withdrawal-engine.ts';
import { pollDeposits } from '../../../../server/workers/deposit-poller.ts';
import {
  confirmSentWithdrawals,
  initWorker,
  recoverStuckWithdrawals,
  resetWithdrawalWorkerStateForTests,
  setWithdrawalWorkerDependenciesForTests,
  runWithdrawalWorker,
} from '../../../../server/workers/withdrawal-worker.ts';
import {
  resetFailedDepositReplayWorkerForTests,
  runFailedDepositReplayWorker,
  setFailedDepositReplayWorkerDependenciesForTests,
} from '../../../../server/workers/failed-deposit-replay-worker.ts';
import { logger } from '../../../../server/utils/logger.ts';

const HOT_WALLET_ADDRESS = Address.parse(USDT_MASTER).toString({ bounceable: true });
const HOT_WALLET_RAW = Address.parse(USDT_MASTER).toRawString();
const ZERO_ADDRESS = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').toString({ bounceable: true });
const HOT_JETTON_WALLET = ZERO_ADDRESS;
const SENDER_JETTON_WALLET = HOT_WALLET_ADDRESS;
const SAFE_WITHDRAWAL_STUCK_USER_MESSAGE =
  'Withdrawal confirmation is taking longer than expected and is under review.';
const SAFE_WITHDRAWAL_FAILED_USER_MESSAGE =
  'Withdrawal processing failed after retries. Your held balance was refunded.';

function registerBaseCleanup(t: TestContext) {
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const findFailedByHashesMock = mock.method(FailedDepositIngestionRepository, 'findByTxHashes', async () => []);
  const findEarliestPendingMock = mock.method(
    FailedDepositIngestionRepository,
    'findEarliestPendingTransactionTime',
    async () => null,
  );
  const findOpenByTxHashesMock = mock.method(UnmatchedDepositRepository, 'findOpenByTxHashes', async () => []);
  const upsertFailedIngestionMock = mock.method(FailedDepositIngestionRepository, 'upsertFailure', async () => {});
  setProductEmailNotificationDependenciesForTests({
    findUserById: async (id) => ({
      id,
      email: `${id}@example.test`,
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    findVerifiedMerchantEmailRecipients: async () => [],
    sendNotificationEmail: async () => {},
  });
  setWithdrawalWorkerDependenciesForTests({
    withLock: async (_resource, _ttlMs, fn) => fn(),
  });
  setFailedDepositReplayWorkerDependenciesForTests({
    buildTransferLookupContext: async () => ({
      memoMap: new Map(),
      processedHashes: new Set(),
      unmatchedOpenHashes: new Set(),
    }),
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
      findOpenByTxHashesMock.mock.restore();
    } catch {}
    try {
      upsertFailedIngestionMock.mock.restore();
    } catch {}
    resetProductEmailNotificationDependenciesForTests();
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
    resetCacheServiceForTests();
  });

  return {
    auditMock,
    findFailedByHashesMock,
    findEarliestPendingMock,
    upsertFailedIngestionMock,
  };
}

function createResponseMock() {
  const response = {
    locals: { requestId: 'req-test' },
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  return response;
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

  let storedDocument: Record<string, unknown> | undefined;
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

  assert.equal(memoLookupMock.mock.callCount(), 1);
  assert.deepEqual(memoLookupMock.mock.calls[0]?.arguments[0], []);
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

  let requestedUrl: URL | undefined;
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

  let requestedUrl: URL | undefined;
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
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async (memos) => {
    const memoDocs: Array<{ memo: string; userId: string }> = [];
    if (memos.includes('memo-transient-failure')) {
      memoDocs.push({ memo: 'memo-transient-failure', userId: 'user-failed' });
    }
    if (memos.includes('memo-transient-success')) {
      memoDocs.push({ memo: 'memo-transient-success', userId: 'user-success' });
    }
    return memoDocs;
  });
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
  const pendingFailure = failedRecord as unknown as FailedDepositIngestionDocument;
  assert.equal(pendingFailure.status, 'pending');

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
        amountUsdt: '1.000000',
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
  const retryingFailure = failedRecord as unknown as FailedDepositIngestionDocument;
  assert.equal(retryingFailure.status, 'pending');
  assert.equal(retryingFailure.retryCount, 1);

  await runFailedDepositReplayWorker();
  assert.ok(failedRecord);
  const resolvedFailure = failedRecord as unknown as FailedDepositIngestionDocument;
  assert.equal(resolvedFailure.status, 'resolved');
  assert.ok(resolvedFailure.resolvedAt instanceof Date);
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

test('failed deposit replay worker batches retry lookup context for the whole batch', async (t) => {
  registerBaseCleanup(t);
  process.env.DEPOSIT_INGESTION_MAX_RETRIES = '3';
  resetEnvCacheForTests();

  const retryableFailures: FailedDepositIngestionDocument[] = [
    {
      txHash: 'retry-batched-1',
      transferData: {
        transaction_hash: 'retry-batched-1',
        transaction_now: 1_700_000_050,
        comment: 'memo-retry-1',
        jetton_master: USDT_MASTER,
        amount: '1000000',
        source: ZERO_ADDRESS,
        source_wallet: SENDER_JETTON_WALLET,
      },
      failedAt: new Date(),
      retryCount: 0,
      lastError: 'initial failure',
      status: 'pending',
      nextRetryAt: new Date(0),
      resolvedAt: null,
      terminalFailureAt: null,
      updatedAt: new Date(),
    },
    {
      txHash: 'retry-batched-2',
      transferData: {
        transaction_hash: 'retry-batched-2',
        transaction_now: 1_700_000_051,
        comment: 'memo-retry-2',
        jetton_master: USDT_MASTER,
        amount: '2000000',
        source: ZERO_ADDRESS,
        source_wallet: SENDER_JETTON_WALLET,
      },
      failedAt: new Date(),
      retryCount: 0,
      lastError: 'initial failure',
      status: 'pending',
      nextRetryAt: new Date(0),
      resolvedAt: null,
      terminalFailureAt: null,
      updatedAt: new Date(),
    },
  ];
  const sharedContext: TransferLookupContext = {
    memoMap: new Map(),
    processedHashes: new Set(),
    unmatchedOpenHashes: new Set(),
  };
  const receivedContexts: unknown[] = [];

  const findRetryableMock = mock.method(
    FailedDepositIngestionRepository,
    'findRetryable',
    async () => retryableFailures,
  );
  const markResolvedMock = mock.method(FailedDepositIngestionRepository, 'markResolved', async () => {});
  const markRetryScheduledMock = mock.method(FailedDepositIngestionRepository, 'markRetryScheduled', async () => {});
  const markTerminalFailureMock = mock.method(FailedDepositIngestionRepository, 'markTerminalFailure', async () => {});

  t.after(() => findRetryableMock.mock.restore());
  t.after(() => markResolvedMock.mock.restore());
  t.after(() => markRetryScheduledMock.mock.restore());
  t.after(() => markTerminalFailureMock.mock.restore());

  setFailedDepositReplayWorkerDependenciesForTests({
    buildTransferLookupContext: async (transfers: JettonTransferEvent[]) => {
      assert.deepEqual(transfers.map((transfer) => transfer.transaction_hash), ['retry-batched-1', 'retry-batched-2']);
      return sharedContext;
    },
    ingestIncomingTransfer: async (tx: JettonTransferEvent, context?: TransferLookupContext) => {
      receivedContexts.push(context);
      return {
        txHash: tx.transaction_hash,
        decision: 'credit',
        amountRaw: String(tx.amount),
        amountUsdt: tx.transaction_hash === 'retry-batched-1' ? '1.000000' : '2.000000',
        comment: tx.comment ?? '',
        memoStatus: 'active',
        senderJettonWallet: SENDER_JETTON_WALLET,
        senderOwnerAddress: ZERO_ADDRESS,
        txTime: new Date(tx.transaction_now * 1000).toISOString(),
      };
    },
  } as Parameters<typeof setFailedDepositReplayWorkerDependenciesForTests>[0] & {
    buildTransferLookupContext: (transfers: JettonTransferEvent[]) => Promise<TransferLookupContext>;
  });

  await runFailedDepositReplayWorker();

  assert.equal(receivedContexts.length, 2);
  assert.deepEqual(receivedContexts, [sharedContext, sharedContext]);
  assert.equal(markResolvedMock.mock.callCount(), 2);
});

test('requestWithdrawal rejects insufficient balance', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => null);
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumAccountedRawBetween', async () => 0n);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());

  await assert.rejects(
    requestWithdrawal({ userId: 'user-4', toAddress: ZERO_ADDRESS, amountUsdt: '1.500000', withdrawalId: 'wd-1' }),
    /Insufficient balance/,
  );

  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(createQueuedMock.mock.callCount(), 0);
});

test('requestWithdrawal rejects withdrawals below the minimum before deducting balance', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => ({ _id: 'user-minimum' } as any));
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumAccountedRawBetween', async () => 0n);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());

  await assert.rejects(
    requestWithdrawal({ userId: 'user-minimum', toAddress: ZERO_ADDRESS, amountUsdt: '1.499999', withdrawalId: 'wd-minimum' }),
    /Minimum withdrawal is 1.5 USDT/,
  );

  assert.equal(deductMock.mock.callCount(), 0);
  assert.equal(dailyLimitMock.mock.callCount(), 0);
  assert.equal(createQueuedMock.mock.callCount(), 0);
});

test('requestWithdrawal queues a withdrawal atomically with balance deduction', async (t) => {
  registerBaseCleanup(t);

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => ({ _id: 'user-5' } as any));
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumAccountedRawBetween', async () => 0n);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());

  await requestWithdrawal({ userId: 'user-5', toAddress: ZERO_ADDRESS, amountUsdt: '1.500000', withdrawalId: 'wd-2' });

  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(createQueuedMock.mock.callCount(), 1);
  assert.equal((createQueuedMock.mock.calls[0].arguments[0] as { withdrawalId: string }).withdrawalId, 'wd-2');
});

test('requestWithdrawalHandler invalidates dashboard cache but does not email queued withdrawals', async (t) => {
  registerBaseCleanup(t);
  resetCacheServiceForTests();

  const merchantDashboardKey = CacheKeys.merchantDashboard();
  let cacheLoaderCalls = 0;
  await getOrPopulateJson({
    key: merchantDashboardKey,
    ttlSeconds: 60,
    loader: async () => {
      cacheLoaderCalls += 1;
      return { version: cacheLoaderCalls };
    },
  });

  const session = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => session as any);
  let replayExisting: unknown = null;
  const claimMock = mock.method(IdempotencyKeyRepository, 'claimOrGetExisting', async () => replayExisting as any);
  const completeMock = mock.method(IdempotencyKeyRepository, 'markCompletedIfProcessing', async () => true);
  const deductMock = mock.method(userServiceModule.UserService, 'deductBalanceSafely', async () => ({ _id: 'user-handler' } as any));
  const createQueuedMock = mock.method(WithdrawalRepository, 'createQueued', async () => {});
  const dailyLimitMock = mock.method(WithdrawalRepository, 'sumAccountedRawBetween', async () => 0n);
  const queuedEmailMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalQueued', async () => {});

  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMock.mock.restore());
  t.after(() => completeMock.mock.restore());
  t.after(() => deductMock.mock.restore());
  t.after(() => createQueuedMock.mock.restore());
  t.after(() => dailyLimitMock.mock.restore());
  t.after(() => queuedEmailMock.mock.restore());

  const firstResponse = createResponseMock();
  await requestWithdrawalHandler({
    user: { id: 'user-handler' },
    body: { toAddress: ZERO_ADDRESS, amountUsdt: '1.5' },
    get: (name: string) => name.toLowerCase() === 'idempotency-key' ? 'idem-handler-1' : undefined,
  } as any, firstResponse as any);

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(queuedEmailMock.mock.callCount(), 0);
  const cacheRead = await getOrPopulateJson({
    key: merchantDashboardKey,
    ttlSeconds: 60,
    loader: async () => {
      cacheLoaderCalls += 1;
      return { version: cacheLoaderCalls };
    },
  });
  assert.equal(cacheRead.cacheStatus, 'miss');
  assert.deepEqual(cacheRead.value, { version: 2 });
  assert.equal(cacheLoaderCalls, 2);
  const replayBody = firstResponse.body;

  replayExisting = {
    userId: 'user-handler',
    routeKey: 'transactions:withdraw',
    idempotencyKey: 'idem-handler-1',
    requestHash: completeMock.mock.calls[0]?.arguments[0]?.requestHash,
    status: 'completed',
    responseStatusCode: 202,
    responseBody: replayBody,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: new Date(),
  };

  const replayResponse = createResponseMock();
  await requestWithdrawalHandler({
    user: { id: 'user-handler' },
    body: { toAddress: ZERO_ADDRESS, amountUsdt: '1.5' },
    get: (name: string) => name.toLowerCase() === 'idempotency-key' ? 'idem-handler-1' : undefined,
  } as any, replayResponse as any);

  assert.equal(replayResponse.statusCode, 202);
  assert.deepEqual(replayResponse.body, replayBody);
  assert.equal(queuedEmailMock.mock.callCount(), 0);
  assert.equal(createQueuedMock.mock.callCount(), 1);
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

  let releaseFirstLock: () => void = () => {
    throw new Error('first withdrawal lock release callback was not initialized');
  };
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
  releaseFirstLock();

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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
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
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_sent_user',
    userId: 'user-6',
    withdrawalId: 'wd-3',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    seqno: 77,
    statusUrl: '/api/transactions/withdrawals/wd-3',
  });
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => retryStateMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
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
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { amount: string }).amount, '2.000000');
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_failed_user',
    userId: 'user-8',
    withdrawalId: 'wd-5',
    amountUsdt: '2.000000',
    toAddress: ZERO_ADDRESS,
    lastError: SAFE_WITHDRAWAL_FAILED_USER_MESSAGE,
    statusUrl: '/api/transactions/withdrawals/wd-5',
  });
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.deepEqual(merchantAlertMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_failed_merchant',
    withdrawalId: 'wd-5',
    amountUsdt: '2.000000',
    toAddress: ZERO_ADDRESS,
    lastError: 'send failed',
  });
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    sendUsdtWithdrawal: async () => {
      throw timeout;
    },
  });

  await runWithdrawalWorker();

  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 19);
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_user',
    userId: 'user-9',
    withdrawalId: 'wd-6',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    seqno: 19,
    lastError: SAFE_WITHDRAWAL_STUCK_USER_MESSAGE,
    statusUrl: '/api/transactions/withdrawals/wd-6',
  });
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.deepEqual(merchantAlertMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'wd-6',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    seqno: 19,
    lastError: timeout.message,
  });
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
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
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.equal((transitionMock.mock.calls[0].arguments[0] as { scenario: string }).scenario, 'withdrawal_stuck_user');
  assert.equal(
    (transitionMock.mock.calls[0].arguments[0] as { lastError: string }).lastError,
    SAFE_WITHDRAWAL_STUCK_USER_MESSAGE,
  );
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.equal((merchantAlertMock.mock.calls[0].arguments[0] as { scenario: string }).scenario, 'withdrawal_stuck_merchant');
  assert.equal((merchantAlertMock.mock.calls[0].arguments[0] as { lastError: string }).lastError, 'write failed');
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => claimMock.mock.restore());
  t.after(() => markSentMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
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
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.equal((transitionMock.mock.calls[0].arguments[0] as { scenario: string }).scenario, 'withdrawal_stuck_user');
  assert.equal(
    (transitionMock.mock.calls[0].arguments[0] as { lastError: string }).lastError,
    SAFE_WITHDRAWAL_STUCK_USER_MESSAGE,
  );
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.equal((merchantAlertMock.mock.calls[0].arguments[0] as { scenario: string }).scenario, 'withdrawal_stuck_merchant');
  assert.equal((merchantAlertMock.mock.calls[0].arguments[0] as { lastError: string }).lastError, 'audit failed');
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});

  t.after(() => pendingMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => withdrawnMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
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
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_confirmed_user',
    userId: 'user-10',
    withdrawalId: 'wd-7',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    txHash: 'chain-hash-1',
    statusUrl: '/api/transactions/withdrawals/wd-7',
  });
});

test('markConfirmed can reconcile stale processing withdrawals found on-chain', async (t) => {
  const repository = WithdrawalRepository as unknown as {
    collection: () => {
      updateOne: (...args: unknown[]) => Promise<void>;
    };
  };
  const updateCalls: unknown[][] = [];
  const collectionMock = mock.method(repository, 'collection', () => ({
    async updateOne(...args: unknown[]) {
      updateCalls.push(args);
    },
  }));

  t.after(() => collectionMock.mock.restore());

  const confirmedAt = new Date('2026-01-02T00:07:00.000Z');
  await WithdrawalRepository.markConfirmed('doc-recover-1', 'chain-recovered-1', confirmedAt);

  assert.equal(updateCalls.length, 1);
  const filter = updateCalls[0]?.[0] as { _id?: string; status?: { $in?: string[] } };
  const update = updateCalls[0]?.[1] as { $set?: { status?: string; txHash?: string; confirmedAt?: Date } };
  assert.equal(filter._id, 'doc-recover-1');
  assert.deepEqual(filter.status?.$in, ['processing', 'sent', 'stuck']);
  assert.equal(update.$set?.status, 'confirmed');
  assert.equal(update.$set?.txHash, 'chain-recovered-1');
  assert.equal(update.$set?.confirmedAt, confirmedAt);
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
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => pendingMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => refundMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => null,
  });

  await confirmSentWithdrawals();

  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[2], 18);
  assert.equal(refundMock.mock.callCount(), 0);
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_user',
    userId: 'user-11',
    withdrawalId: 'wd-8',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    seqno: 18,
    lastError: SAFE_WITHDRAWAL_STUCK_USER_MESSAGE,
    statusUrl: '/api/transactions/withdrawals/wd-8',
  });
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.deepEqual(merchantAlertMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'wd-8',
    amountUsdt: '1.000000',
    toAddress: ZERO_ADDRESS,
    seqno: 18,
    lastError: 'Expired waiting for confirmation on-chain',
  });
});

test('confirmSentWithdrawals does not repeat stuck notifications for already-stuck unconfirmed withdrawals', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const pendingMock = mock.method(WithdrawalRepository, 'findPendingConfirmation', async () => [{
    _id: 'doc-stuck-repeat',
    withdrawalId: 'wd-stuck-repeat',
    userId: 'user-stuck-repeat',
    toAddress: ZERO_ADDRESS,
    amountRaw: '1000000',
    amountDisplay: '1.000000',
    status: 'stuck' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sentAt: new Date('2026-01-01T00:00:00.000Z'),
    seqno: 19,
    retries: 0,
  }]);
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});
  let confirmationChecks = 0;

  t.after(() => pendingMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => {
      confirmationChecks += 1;
      return null;
    },
  });

  await confirmSentWithdrawals();

  assert.equal(confirmationChecks, 1);
  assert.equal(markStuckMock.mock.callCount(), 0);
  assert.equal(transitionMock.mock.callCount(), 0);
  assert.equal(merchantAlertMock.mock.callCount(), 0);
});

test('recoverStuckWithdrawals sends confirmed user notification after recovered confirmation', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const startedAt = new Date('2026-01-02T00:00:00.000Z');
  const staleMock = mock.method(WithdrawalRepository, 'findStaleProcessing', async () => [{
    _id: 'doc-recover-1',
    withdrawalId: 'wd-recover-1',
    userId: 'user-recover-1',
    toAddress: ZERO_ADDRESS,
    amountRaw: '3000000',
    amountDisplay: '3.000000',
    status: 'processing' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt,
    retries: 0,
  }]);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const processedCreateMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const markConfirmedMock = mock.method(WithdrawalRepository, 'markConfirmed', async () => {});
  const withdrawnMock = mock.method(UserBalanceRepository, 'recordWithdrawalConfirmed', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});

  t.after(() => staleMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => processedCreateMock.mock.restore());
  t.after(() => markConfirmedMock.mock.restore());
  t.after(() => withdrawnMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => ({
      txHash: 'chain-recovered-1',
      confirmedAt: new Date('2026-01-02T00:07:00.000Z'),
    }),
  });

  await recoverStuckWithdrawals();

  assert.equal(markConfirmedMock.mock.callCount(), 1);
  assert.equal(withdrawnMock.mock.callCount(), 1);
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_confirmed_user',
    userId: 'user-recover-1',
    withdrawalId: 'wd-recover-1',
    amountUsdt: '3.000000',
    toAddress: ZERO_ADDRESS,
    txHash: 'chain-recovered-1',
    statusUrl: '/api/transactions/withdrawals/wd-recover-1',
  });
});

test('recoverStuckWithdrawals sends stuck user and merchant notifications after processing timeout', async (t) => {
  registerBaseCleanup(t);
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });
  await initWorker();

  const startedAt = new Date('2026-01-02T00:00:00.000Z');
  const staleMock = mock.method(WithdrawalRepository, 'findStaleProcessing', async () => [{
    _id: 'doc-recover-2',
    withdrawalId: 'wd-recover-2',
    userId: 'user-recover-2',
    toAddress: ZERO_ADDRESS,
    amountRaw: '4000000',
    amountDisplay: '4.000000',
    status: 'processing' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt,
    seqno: 44,
    retries: 0,
  }]);
  const markStuckMock = mock.method(WithdrawalRepository, 'markStuck', async () => {});
  const transitionMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalTransition', async () => {});
  const merchantAlertMock = mock.method(ProductEmailNotificationService, 'sendWithdrawalMerchantAlert', async () => {});

  t.after(() => staleMock.mock.restore());
  t.after(() => markStuckMock.mock.restore());
  t.after(() => transitionMock.mock.restore());
  t.after(() => merchantAlertMock.mock.restore());
  setWithdrawalWorkerDependenciesForTests({
    findWithdrawalTransferOnChain: async () => null,
  });

  await recoverStuckWithdrawals();

  const lastError = 'Processing state expired before a definitive on-chain outcome was recorded';
  assert.equal(markStuckMock.mock.callCount(), 1);
  assert.equal(markStuckMock.mock.calls[0].arguments[1], lastError);
  assert.equal(transitionMock.mock.callCount(), 1);
  assert.deepEqual(transitionMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_user',
    userId: 'user-recover-2',
    withdrawalId: 'wd-recover-2',
    amountUsdt: '4.000000',
    toAddress: ZERO_ADDRESS,
    lastError: SAFE_WITHDRAWAL_STUCK_USER_MESSAGE,
    statusUrl: '/api/transactions/withdrawals/wd-recover-2',
    seqno: 44,
  });
  assert.equal(merchantAlertMock.mock.callCount(), 1);
  assert.deepEqual(merchantAlertMock.mock.calls[0].arguments[0], {
    scenario: 'withdrawal_stuck_merchant',
    withdrawalId: 'wd-recover-2',
    amountUsdt: '4.000000',
    toAddress: ZERO_ADDRESS,
    lastError,
    seqno: 44,
  });
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
