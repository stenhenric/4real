import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { Address } from '@ton/ton';

import { resetEnvCacheForTests } from '../config/env.ts';
import { USDT_MASTER } from '../lib/jetton.ts';
import { User } from '../models/User.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { AuditService } from '../services/audit.service.ts';
import {
  reconcileMerchantDeposit,
  replayDepositWindow,
} from '../services/deposit-ingestion.service.ts';
import { setHotWalletRuntimeForTests } from '../services/hot-wallet-runtime.service.ts';
import * as userServiceModule from '../services/user.service.ts';

const HOT_WALLET_ADDRESS = Address.parse(USDT_MASTER).toString({ bounceable: true });
const HOT_JETTON_WALLET = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').toString({ bounceable: true });
const SENDER_OWNER_ADDRESS = HOT_WALLET_ADDRESS;
const SENDER_JETTON_WALLET = HOT_JETTON_WALLET;

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

function createLeanQuery<T>(value: T) {
  return {
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function registerCleanup(t: TestContext) {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.HOT_WALLET_ADDRESS = HOT_WALLET_ADDRESS;
  resetEnvCacheForTests();
  setHotWalletRuntimeForTests({
    hotWalletAddress: HOT_WALLET_ADDRESS,
    hotJettonWallet: HOT_JETTON_WALLET,
    derivedHotJettonWallet: HOT_JETTON_WALLET,
  });

  t.after(() => {
    setHotWalletRuntimeForTests(null);
  });
}

test('replayDepositWindow classifies live-shaped transfers without mutating balances in dry-run mode', async (t) => {
  registerCleanup(t);

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'credit-hash',
      transaction_now: 1_700_000_100,
      jetton_master: USDT_MASTER,
      amount: '2500000',
      source: SENDER_OWNER_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
      decoded_forward_payload: { comment: 'memo-credit' },
    },
    {
      transaction_hash: 'open-unmatched-hash',
      transaction_now: 1_700_000_101,
      jetton_master: USDT_MASTER,
      amount: '3000000',
      source: SENDER_OWNER_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
      decoded_forward_payload: { comment: 'memo-open' },
    },
  ]) as Response);
  const seenHashesMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const unmatchedMock = mock.method(UnmatchedDepositRepository, 'findOpenByTxHashes', async (txHashes) => (
    txHashes.includes('open-unmatched-hash')
      ? [{
          txHash: 'open-unmatched-hash',
          receivedRaw: '3000000',
          comment: 'memo-open',
          senderJettonWallet: SENDER_JETTON_WALLET,
          senderOwnerAddress: SENDER_OWNER_ADDRESS,
          txTime: 1_700_000_101,
          recordedAt: new Date(),
          memoStatus: 'missing',
          resolved: false,
        }]
      : []
  ));
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => [
    {
      memo: 'memo-credit',
      userId: '507f1f77bcf86cd799439011',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    },
  ]);
  const userFindMock = mock.method(User, 'find', (() => createLeanQuery([
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      username: 'memo-owner',
    },
  ])) as any);

  t.after(() => fetchMock.mock.restore());
  t.after(() => seenHashesMock.mock.restore());
  t.after(() => unmatchedMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => userFindMock.mock.restore());

  const result = await replayDepositWindow({
    sinceUnixTime: 1_700_000_000,
    untilUnixTime: 1_700_000_200,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.transfers.length, 2);
  assert.deepEqual(result.transfers.map((transfer) => transfer.decision), ['credit', 'already_unmatched_open']);
  assert.equal(result.transfers[0].senderOwnerAddress, SENDER_OWNER_ADDRESS);
  assert.equal(result.transfers[0].senderJettonWallet, SENDER_JETTON_WALLET);
  assert.equal(result.transfers[0].candidateUsername, 'memo-owner');
});

test('replayDepositWindow apply returns post-ingestion decisions when a memo is consumed mid-run', async (t) => {
  registerCleanup(t);

  const fetchMock = mock.method(globalThis, 'fetch', async () => createToncenterResponse([
    {
      transaction_hash: 'credit-first',
      transaction_now: 1_700_000_110,
      jetton_master: USDT_MASTER,
      amount: '2500000',
      source: SENDER_OWNER_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
      decoded_forward_payload: { comment: 'memo-shared' },
    },
    {
      transaction_hash: 'credit-second',
      transaction_now: 1_700_000_111,
      jetton_master: USDT_MASTER,
      amount: '3000000',
      source: SENDER_OWNER_ADDRESS,
      source_wallet: SENDER_JETTON_WALLET,
      decoded_forward_payload: { comment: 'memo-shared' },
    },
  ]) as Response);
  let memoLookupCount = 0;
  const memoLookupMock = mock.method(DepositMemoRepository, 'findByMemos', async () => {
    memoLookupCount += 1;
    return [{
      memo: 'memo-shared',
      userId: '507f1f77bcf86cd799439011',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      used: memoLookupCount > 1,
    }];
  });
  const findSeenHashesMock = mock.method(ProcessedTransactionRepository, 'findSeenHashes', async () => []);
  const findUnmatchedBatchMock = mock.method(UnmatchedDepositRepository, 'findOpenByTxHashes', async () => []);
  const findProcessedMock = mock.method(ProcessedTransactionRepository, 'findByHash', async () => null);
  const findUnmatchedMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => null);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  let claimCount = 0;
  const claimMemoMock = mock.method(DepositMemoRepository, 'claimActiveMemo', async () => {
    claimCount += 1;
    return claimCount === 1 ? {
      memo: 'memo-shared',
      userId: '507f1f77bcf86cd799439011',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      used: true,
      usedAt: new Date(),
    } : null;
  });
  const createProcessedMock = mock.method(ProcessedTransactionRepository, 'create', async () => {});
  const createDepositMock = mock.method(DepositRepository, 'create', async () => {});
  const createUnmatchedMock = mock.method(UnmatchedDepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const userFindMock = mock.method(User, 'find', (() => createLeanQuery([
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      username: 'memo-owner',
    },
  ])) as any);

  t.after(() => fetchMock.mock.restore());
  t.after(() => memoLookupMock.mock.restore());
  t.after(() => findSeenHashesMock.mock.restore());
  t.after(() => findUnmatchedBatchMock.mock.restore());
  t.after(() => findProcessedMock.mock.restore());
  t.after(() => findUnmatchedMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMemoMock.mock.restore());
  t.after(() => createProcessedMock.mock.restore());
  t.after(() => createDepositMock.mock.restore());
  t.after(() => createUnmatchedMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => userFindMock.mock.restore());

  const result = await replayDepositWindow({
    sinceUnixTime: 1_700_000_000,
    untilUnixTime: 1_700_000_200,
    dryRun: false,
  });

  assert.equal(result.dryRun, false);
  assert.deepEqual(result.transfers.map((transfer) => transfer.decision), ['credit', 'unmatched']);
  assert.equal(result.transfers[1].memoStatus, 'inactive');
  assert.equal(result.transfers[0].candidateUsername, 'memo-owner');
  assert.equal(findSeenHashesMock.mock.callCount(), 1);
  assert.equal(findUnmatchedBatchMock.mock.callCount(), 1);
  assert.equal(findProcessedMock.mock.callCount(), 0);
  assert.equal(findUnmatchedMock.mock.callCount(), 0);
  assert.equal(createDepositMock.mock.callCount(), 1);
  assert.equal(createUnmatchedMock.mock.callCount(), 1);
  assert.equal(creditMock.mock.callCount(), 1);
});

test('reconcileMerchantDeposit credits an open unmatched deposit and marks it reconciled', async (t) => {
  registerCleanup(t);

  const openDocument = {
    txHash: 'reconcile-hash',
    receivedRaw: '4100000',
    comment: 'memo-reconcile',
    senderJettonWallet: SENDER_JETTON_WALLET,
    senderOwnerAddress: SENDER_OWNER_ADDRESS,
    txTime: 1_700_000_200,
    recordedAt: new Date('2026-04-27T08:00:00.000Z'),
    memoStatus: 'inactive' as const,
    candidateUserId: '507f1f77bcf86cd799439011',
    resolved: false,
  };
  const resolvedDocument = {
    ...openDocument,
    resolved: true,
    resolvedAt: new Date('2026-04-27T08:05:00.000Z'),
    resolvedBy: '507f191e810c19729de860ea',
    resolvedUserId: '507f1f77bcf86cd799439011',
    resolutionAction: 'credited' as const,
    resolutionNote: 'manual reconcile',
  };
  let findCount = 0;
  const unmatchedFindMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => {
    findCount += 1;
    return findCount === 1 ? openDocument : resolvedDocument;
  });
  const userByIdMock = mock.method(userServiceModule.UserService, 'findById', async () => ({
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    username: 'credited-user',
  }) as any);
  const userFindMock = mock.method(User, 'find', (() => createLeanQuery([
    {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      username: 'credited-user',
    },
    {
      _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea'),
      username: 'merchant-admin',
    },
  ])) as any);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const findDepositMock = mock.method(DepositRepository, 'findByTxHash', async () => null);
  const createDepositMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markUsedMock = mock.method(DepositMemoRepository, 'markUsed', async () => {});
  const markResolvedMock = mock.method(UnmatchedDepositRepository, 'markResolved', async () => true);
  const updateProcessedMock = mock.method(ProcessedTransactionRepository, 'updateType', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => unmatchedFindMock.mock.restore());
  t.after(() => userByIdMock.mock.restore());
  t.after(() => userFindMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => findDepositMock.mock.restore());
  t.after(() => createDepositMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markUsedMock.mock.restore());
  t.after(() => markResolvedMock.mock.restore());
  t.after(() => updateProcessedMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  const result = await reconcileMerchantDeposit({
    txHash: 'reconcile-hash',
    action: 'credit',
    actorUserId: '507f191e810c19729de860ea',
    userId: '507f1f77bcf86cd799439011',
    note: 'manual reconcile',
  });

  assert.equal(createDepositMock.mock.callCount(), 1);
  assert.equal((createDepositMock.mock.calls[0].arguments[0] as { senderAddress: string | null }).senderAddress, SENDER_OWNER_ADDRESS);
  assert.equal(creditMock.mock.callCount(), 1);
  assert.equal(creditMock.mock.calls[0].arguments[0], '507f1f77bcf86cd799439011');
  assert.equal(updateProcessedMock.mock.callCount(), 1);
  assert.equal(updateProcessedMock.mock.calls[0].arguments[1], 'deposit_reconciled_credit');
  assert.equal(result.resolutionStatus, 'credited');
  assert.equal(result.resolvedUserId, '507f1f77bcf86cd799439011');
});

test('reconcileMerchantDeposit does not credit when another operator resolves the deposit first', async (t) => {
  registerCleanup(t);

  const openDocument = {
    txHash: 'race-hash',
    receivedRaw: '4100000',
    comment: 'memo-race',
    senderJettonWallet: SENDER_JETTON_WALLET,
    senderOwnerAddress: SENDER_OWNER_ADDRESS,
    txTime: 1_700_000_220,
    recordedAt: new Date('2026-04-27T08:10:00.000Z'),
    memoStatus: 'inactive' as const,
    candidateUserId: '507f1f77bcf86cd799439011',
    resolved: false,
  };
  const resolvedDocument = {
    ...openDocument,
    resolved: true,
    resolvedAt: new Date('2026-04-27T08:11:00.000Z'),
    resolvedBy: '507f191e810c19729de860eb',
    resolutionAction: 'dismissed' as const,
    resolutionNote: 'handled by another admin',
  };
  let findCount = 0;
  const unmatchedFindMock = mock.method(UnmatchedDepositRepository, 'findByTxHash', async () => {
    findCount += 1;
    return findCount === 1 ? openDocument : resolvedDocument;
  });
  const userByIdMock = mock.method(userServiceModule.UserService, 'findById', async () => ({
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    username: 'credited-user',
  }) as any);
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  const markResolvedMock = mock.method(UnmatchedDepositRepository, 'markResolved', async () => false);
  const findDepositMock = mock.method(DepositRepository, 'findByTxHash', async () => null);
  const createDepositMock = mock.method(DepositRepository, 'create', async () => {});
  const creditMock = mock.method(UserBalanceRepository, 'creditDeposit', async () => {});
  const markUsedMock = mock.method(DepositMemoRepository, 'markUsed', async () => {});
  const updateProcessedMock = mock.method(ProcessedTransactionRepository, 'updateType', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => unmatchedFindMock.mock.restore());
  t.after(() => userByIdMock.mock.restore());
  t.after(() => startSessionMock.mock.restore());
  t.after(() => markResolvedMock.mock.restore());
  t.after(() => findDepositMock.mock.restore());
  t.after(() => createDepositMock.mock.restore());
  t.after(() => creditMock.mock.restore());
  t.after(() => markUsedMock.mock.restore());
  t.after(() => updateProcessedMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  await assert.rejects(
    reconcileMerchantDeposit({
      txHash: 'race-hash',
      action: 'credit',
      actorUserId: '507f191e810c19729de860ea',
      userId: '507f1f77bcf86cd799439011',
      note: 'manual reconcile',
    }),
    (error: unknown) => {
      assert.equal(
        typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : null,
        'DEPOSIT_REVIEW_ALREADY_RESOLVED',
      );
      return true;
    },
  );

  assert.equal(findDepositMock.mock.callCount(), 0);
  assert.equal(createDepositMock.mock.callCount(), 0);
  assert.equal(creditMock.mock.callCount(), 0);
  assert.equal(markUsedMock.mock.callCount(), 0);
  assert.equal(updateProcessedMock.mock.callCount(), 0);
  assert.equal(auditMock.mock.callCount(), 0);
});
