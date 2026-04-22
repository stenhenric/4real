import mongoose from 'mongoose';

export async function generateDepositMemo(userId: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const memo = `d-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await db.collection('deposit_memos').insertOne({
    memo,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600_000), // expire after 24h
    used: false,
  });

  return {
    memo,
    address: process.env.HOT_WALLET_ADDRESS,
    instructions: `Send USDT to ${process.env.HOT_WALLET_ADDRESS} with comment: ${memo}`,
    expiresIn: '24 hours',
  };
}
