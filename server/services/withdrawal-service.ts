import mongoose from 'mongoose';

export async function requestWithdrawal({ userId, toAddress, amountUsdt, withdrawalId }: { userId: string, toAddress: string, amountUsdt: number, withdrawalId: string }) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const amountRaw = BigInt(Math.round(amountUsdt * 1_000_000)).toString();

  const userBalance = await db.collection('user_balances').findOne({ userId });
  if (!userBalance || BigInt(userBalance.balanceRaw) < BigInt(amountRaw)) {
    throw new Error('Insufficient balance');
  }

  const currentBalance = BigInt(userBalance.balanceRaw);
  const newBalanceRaw = (currentBalance - BigInt(amountRaw)).toString();

  // 2. Reserve funds (deduct from ledger immediately — before sending)
  const result = await db.collection('user_balances').updateOne(
    { userId, balanceRaw: userBalance.balanceRaw }, // guard
    { $set: { balanceRaw: newBalanceRaw, updatedAt: new Date() } }
  );

  if (result.modifiedCount > 0) {
      const { User } = await import('../models/User');
      await User.findByIdAndUpdate(userId, {
          $inc: { balance: -amountUsdt }
      });
  }

  if (result.modifiedCount === 0) {
      throw new Error('Balance changed during withdrawal request. Please try again.');
  }

  // 3. Enqueue
  await db.collection('withdrawals').insertOne({
    withdrawalId,           // unique ID (idempotency key)
    userId,
    toAddress,
    amountRaw,
    amountDisplay: amountUsdt.toString(),
    status: 'queued',       // queued → processing → sent → confirmed | failed
    createdAt: new Date(),
    retries: 0,
  });
}
