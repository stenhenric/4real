import mongoose from 'mongoose';
import { sendUsdtWithdrawal } from '../services/withdrawal-engine';
import { getOrDeriveJettonWallet } from '../lib/jetton';
import { getHotWallet } from '../lib/ton-client';

let isSending = false;
let hotJettonWallet: string | null = null;

export async function initWorker() {
  const { wallet } = await getHotWallet();
  hotJettonWallet = await getOrDeriveJettonWallet(wallet.address.toString());
  console.log(`Hot jetton wallet: ${hotJettonWallet}`);
}

export async function runWithdrawalWorker() {
  const db = mongoose.connection.db;
  if (!db || !hotJettonWallet) return;
  if (isSending) return;
  isSending = true;

  try {
    const doc = await db.collection('withdrawals').findOneAndUpdate(
      { status: 'queued', retries: { $lt: 3 } },
      { $set: { status: 'processing', startedAt: new Date() } },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );

    if (!doc) return;

    try {
      const seqno = await sendUsdtWithdrawal({
        toAddress: doc.toAddress,
        amountRaw: doc.amountRaw,
        withdrawalId: doc.withdrawalId,
        hotJettonWallet,
      });

      await db.collection('withdrawals').updateOne(
        { _id: doc._id },
        { $set: { status: 'sent', sentAt: new Date(), seqno } }
      );

      console.log(`Withdrawal ${doc.withdrawalId} sent (seqno: ${seqno})`);

    } catch (sendErr: unknown) {
      const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(`Withdrawal ${doc.withdrawalId} failed:`, errorMessage);

      if (errorMessage.includes('Seqno stuck')) {
        // Timeout -> Tx might be on chain. Leave it in a stuck/processing state or mark as stuck for manual review or the recovery worker.
        await db.collection('withdrawals').updateOne(
          { _id: doc._id },
          { $set: { status: 'stuck', lastError: errorMessage, updatedAt: new Date() } }
        );
      } else {
        const retries = (doc.retries ?? 0) + 1;
        const newStatus = retries >= 3 ? 'failed' : 'queued';

        await db.collection('withdrawals').updateOne(
          { _id: doc._id },
          { $set: { status: newStatus, lastError: errorMessage, updatedAt: new Date() },
            $inc: { retries: 1 } }
        );

        if (newStatus === 'failed') {
          const userBalanceDoc = await db.collection('user_balances').findOne({ userId: doc.userId });
          const currentBalance = BigInt(userBalanceDoc?.balanceRaw ?? '0');
          const newBalanceRaw = (currentBalance + BigInt(doc.amountRaw)).toString();

          await db.collection('user_balances').updateOne(
            { userId: doc.userId },
            { $set: { balanceRaw: newBalanceRaw, updatedAt: new Date() } }
          );

          // Also refund the User model balance
          const mongoose = (await import('mongoose')).default;
          const User = (await import('../models/User')).User;
          await User.findByIdAndUpdate(doc.userId, {
            $inc: { balance: Number(doc.amountRaw) / 1e6 }
          });

          console.warn(`Withdrawal ${doc.withdrawalId} permanently failed — balance refunded`);
        }
      }
    }

  } finally {
    isSending = false;
  }
}

export async function recoverStuckWithdrawals() {
    const db = mongoose.connection.db;
    if (!db) return;
    const tenMinsAgo = new Date(Date.now() - 10 * 60_000);
    const stuck = await db.collection('withdrawals').find({
      status: 'processing',
      startedAt: { $lt: tenMinsAgo },
    }).toArray();

    for (const doc of stuck) {
      console.warn(`Resetting stuck withdrawal ${doc.withdrawalId} → queued`);
      await db.collection('withdrawals').updateOne(
        { _id: doc._id },
        { $set: { status: 'queued', updatedAt: new Date() } }
      );
    }
}
