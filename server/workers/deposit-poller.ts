import mongoose from 'mongoose';
import { extractJettonTransferComment, USDT_MASTER, addressesEqual } from '../lib/jetton.ts';
import { getEnv } from '../config/env.ts';
import { getToncenterBaseUrl } from '../lib/ton-client.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { UserService } from '../services/user.service.ts';
import { getHotWalletRuntime } from '../services/hot-wallet-runtime.service.ts';
import { logger } from '../utils/logger.ts';

interface JettonTransfer {
  transaction_hash: string;
  transaction_now: number;
  comment?: string;
  jetton_master: string;
  amount: string | number;
  source: string;
  source_owner?: string | null;
  decoded_forward_payload?: { comment?: string } | Array<{ comment?: string }> | null;
}

interface DepositMemo {
  _id?: unknown;
  userId: string;
  memo: string;
  used?: boolean;
  usedAt?: Date;
}

const TONCENTER_BASE = getToncenterBaseUrl();

export async function pollDeposits() {
  const env = getEnv();
  const { hotJettonWallet } = getHotWalletRuntime();
  const state = await PollerStateRepository.findByKey('deposit_poller');
  const sinceTime = state?.lastProcessedTime ?? Math.floor(Date.now() / 1000) - 3600;

  const transfers = await fetchIncomingTransfers(
    hotJettonWallet,
    sinceTime
  );

  if (transfers.length === 0) return;

  // 1. Bulk check already seen transactions to avoid N+1 queries
  const txHashes = transfers.map((tx: JettonTransfer) => tx.transaction_hash);
  const seenDocs = await ProcessedTransactionRepository.findSeenHashes(txHashes);
  const seenHashes = new Set(seenDocs.map(d => d.txHash));

  const newTransfers = transfers.filter((tx: JettonTransfer) => !seenHashes.has(tx.transaction_hash));
  if (newTransfers.length === 0) {
    const latestTime = Math.max(...transfers.map((t: JettonTransfer) => t.transaction_now));
    await PollerStateRepository.setLastProcessedTime('deposit_poller', latestTime);
    return;
  }

  // 2. Bulk fetch memos for the new transfers
  const comments = [
    ...new Set(
      newTransfers
        .map((tx: JettonTransfer) => extractJettonTransferComment(tx))
        .filter((comment) => comment.length > 0),
    ),
  ];
  const memoDocs = await DepositMemoRepository.findByMemos(comments) as DepositMemo[];
  const memoMap = new Map<string, DepositMemo>(memoDocs.map(m => [m.memo, m]));

  for (const tx of newTransfers) {
    await processIncomingTransfer(tx, memoMap);
  }

  const latestTime = Math.max(...transfers.map((t: JettonTransfer) => t.transaction_now));
  await PollerStateRepository.setLastProcessedTime('deposit_poller', latestTime);
}

async function fetchIncomingTransfers(jettonWalletAddress: string, sinceTime: number): Promise<JettonTransfer[]> {
  let allTransfers: JettonTransfer[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const url = new URL(`${TONCENTER_BASE}/api/v3/jetton/transfers`);
    url.searchParams.set('owner_address', jettonWalletAddress);
    url.searchParams.set('direction', 'in');
    url.searchParams.set('jetton_master', USDT_MASTER);
    url.searchParams.set('start_utime', String(sinceTime));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort', 'asc');

    try {
      const env = getEnv();
      const res = await fetch(url.toString(), {
        headers: { 'X-API-Key': env.TONCENTER_API_KEY ?? '' },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 429) {
        logger.warn('deposit_poller.rate_limited');
        break; // Return what we have so far
      }
      if (!res.ok) throw new Error(`Toncenter error ${res.status}`);

      const data = await res.json();
      const transfers = data.jetton_transfers ?? [];

      allTransfers = allTransfers.concat(transfers);

      if (transfers.length < limit) {
        break;
      }

      offset += limit;
    } catch (error) {
      logger.error('deposit_poller.fetch_failed', { error });
      break; // Return what we have so far
    }
  }

  return allTransfers;
}

async function processIncomingTransfer(tx: JettonTransfer, memoMap: Map<string, DepositMemo>) {
  const txHash = tx.transaction_hash;

  if (!tx.jetton_master) return;

  if (!addressesEqual(tx.jetton_master, USDT_MASTER)) {
      return; // Reject fakes
  }

  const receivedRaw = String(tx.amount);
  const comment = extractJettonTransferComment(tx);
  const senderJettonWallet = tx.source;
  const senderAddress = tx.source_owner ?? null;
  const txTime = tx.transaction_now;

  const memoDoc = memoMap.get(comment);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (!memoDoc?.userId) {
        await UnmatchedDepositRepository.create({
          txHash,
          receivedRaw,
          comment,
          senderJettonWallet,
          txTime,
          recordedAt: new Date(),
        }, session);
        await ProcessedTransactionRepository.create({ txHash, processedAt: new Date(), type: 'deposit_unmatched' }, session);
        return;
      }

      const claimedMemo = await DepositMemoRepository.claimActiveMemo(comment, session);
      if (!claimedMemo?.userId) {
        await UnmatchedDepositRepository.create({
          txHash,
          receivedRaw,
          comment,
          senderJettonWallet,
          txTime,
          recordedAt: new Date(),
        }, session);
        await ProcessedTransactionRepository.create({ txHash, processedAt: new Date(), type: 'deposit_unmatched' }, session);
        return;
      }

      await ProcessedTransactionRepository.create({ txHash, processedAt: new Date(), type: 'deposit' }, session);
      await DepositRepository.create({
        txHash,
        userId: claimedMemo.userId,
        amountRaw: receivedRaw,
        amountDisplay: (Number(receivedRaw) / 1e6).toFixed(6),
        comment,
        senderJettonWallet,
        senderAddress,
        txTime: new Date(txTime * 1000),
        status: 'confirmed',
        createdAt: new Date(),
      }, session);

      await UserBalanceRepository.creditDeposit(claimedMemo.userId, receivedRaw, session);

      await UserService.syncUserDisplayBalance(claimedMemo.userId, session);
    });

  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
