import mongoose from 'mongoose';
import { USDT_MASTER, addressesEqual } from '../lib/jetton';
import dotenv from 'dotenv';
import { User } from '../models/User';

dotenv.config();

interface JettonTransfer {
  transaction_hash: string;
  transaction_now: number;
  comment?: string;
  jetton_master: string;
  amount: string | number;
  source: string;
  source_owner?: string | null;
}

interface DepositMemo {
  _id?: any;
  userId: string;
  memo: string;
  used?: boolean;
  usedAt?: Date;
}

const TONCENTER_BASE = (process.env.NETWORK === 'testnet')
  ? 'https://testnet.toncenter.com'
  : 'https://toncenter.com';

export async function pollDeposits() {
  const db = mongoose.connection.db;
  if (!db) {
      console.error("Database not ready for polling.");
      return;
  }
  if (!process.env.HOT_JETTON_WALLET) {
      console.error("HOT_JETTON_WALLET is not defined.");
      return;
  }

  const state = await db.collection('poller_state').findOne({ key: 'deposit_poller' });
  const sinceTime = state?.lastProcessedTime ?? Math.floor(Date.now() / 1000) - 3600;

  const transfers = await fetchIncomingTransfers(
    process.env.HOT_JETTON_WALLET,
    sinceTime
  );

  if (transfers.length === 0) return;

  // 1. Bulk check already seen transactions to avoid N+1 queries
  const txHashes = transfers.map((tx: JettonTransfer) => tx.transaction_hash);
  const seenDocs = await db.collection('processed_txs')
    .find({ txHash: { $in: txHashes } })
    .project({ txHash: 1 })
    .toArray();
  const seenHashes = new Set(seenDocs.map(d => d.txHash));

  const newTransfers = transfers.filter((tx: JettonTransfer) => !seenHashes.has(tx.transaction_hash));
  if (newTransfers.length === 0) {
    const latestTime = Math.max(...transfers.map((t: JettonTransfer) => t.transaction_now));
    await db.collection('poller_state').updateOne(
      { key: 'deposit_poller' },
      { $set: { lastProcessedTime: latestTime, updatedAt: new Date() } },
      { upsert: true }
    );
    return;
  }

  // 2. Bulk fetch memos for the new transfers
  const comments = [...new Set(newTransfers.map((tx: JettonTransfer) => tx.comment).filter(Boolean))];
  const memoDocs = await db.collection('deposit_memos')
    .find({ memo: { $in: comments } })
    .toArray() as unknown as DepositMemo[];
  const memoMap = new Map<string, DepositMemo>(memoDocs.map(m => [m.memo, m]));

  for (const tx of newTransfers) {
    await processIncomingTransfer(db, tx, memoMap);
  }

  const latestTime = Math.max(...transfers.map((t: JettonTransfer) => t.transaction_now));
  await db.collection('poller_state').updateOne(
    { key: 'deposit_poller' },
    { $set: { lastProcessedTime: latestTime, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function fetchIncomingTransfers(jettonWalletAddress: string, sinceTime: number): Promise<JettonTransfer[]> {
  const url = new URL(`${TONCENTER_BASE}/api/v3/jetton/transfers`);
  url.searchParams.set('owner_address', jettonWalletAddress);
  url.searchParams.set('direction', 'in');
  url.searchParams.set('jetton_master', USDT_MASTER);
  url.searchParams.set('start_utime', String(sinceTime));
  url.searchParams.set('limit', '50');
  url.searchParams.set('sort', 'asc');

  try {
      const res = await fetch(url.toString(), {
        headers: { 'X-API-Key': process.env.TONCENTER_API_KEY || '' },
      });

      if (res.status === 429) {
        console.warn('Toncenter rate limited — backing off');
        return [];
      }
      if (!res.ok) throw new Error(`Toncenter error ${res.status}`);

      const data = await res.json();
      return data.jetton_transfers ?? [];
  } catch (error) {
      console.error('Error fetching incoming transfers:', error);
      return [];
  }
}

async function processIncomingTransfer(db: mongoose.mongo.Db, tx: JettonTransfer, memoMap: Map<string, DepositMemo>) {
  const txHash = tx.transaction_hash;

  if (!tx.jetton_master) return;

  if (!addressesEqual(tx.jetton_master, USDT_MASTER)) {
      return; // Reject fakes
  }

  const receivedRaw = String(tx.amount);
  const comment = tx.comment ?? '';
  const senderJettonWallet = tx.source;
  const senderAddress = tx.source_owner ?? null;
  const txTime = tx.transaction_now;

  const memoDoc = memoMap.get(comment);
  const userId = memoDoc?.userId ?? null;

  if (!userId) {
    await db.collection('unmatched_deposits').insertOne({
      txHash, receivedRaw, comment, senderJettonWallet, txTime, recordedAt: new Date(),
    });
    await db.collection('processed_txs').insertOne({ txHash, processedAt: new Date(), type: 'deposit_unmatched' });
    return;
  }

  const client = mongoose.connection.getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      await db.collection('processed_txs').insertOne(
        { txHash, processedAt: new Date(), type: 'deposit' },
        { session }
      );

      await db.collection('deposits').insertOne({
        txHash,
        userId,
        amountRaw: receivedRaw,
        amountDisplay: (Number(receivedRaw) / 1e6).toFixed(6),
        comment,
        senderJettonWallet,
        senderAddress,
        txTime: new Date(txTime * 1000),
        status: 'confirmed',
        createdAt: new Date(),
      }, { session });

      const userBalanceDoc = await db.collection('user_balances').findOne({ userId }, { session });
      const currentBalance = BigInt(userBalanceDoc?.balanceRaw ?? '0');
      const newBalanceRaw = (currentBalance + BigInt(receivedRaw)).toString();

      await db.collection('user_balances').updateOne(
        { userId },
        {
          $set: { balanceRaw: newBalanceRaw, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, session }
      );

      // Sync the user model balance too to be consistent with main app
      const currentUsdt = Number(receivedRaw) / 1e6;
      await User.findByIdAndUpdate(userId, {
          $inc: { balance: currentUsdt }
      }, { session });
    });

    console.log(`Deposit confirmed: user=${userId} amount=${Number(receivedRaw)/1e6} USDT tx=${txHash}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }

  await db.collection('deposit_memos').updateOne(
    { memo: comment },
    { $set: { used: true, usedAt: new Date() } }
  );
}
