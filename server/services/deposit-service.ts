import crypto from 'crypto';
import mongoose from 'mongoose';
import crypto from 'crypto';

export async function generateDepositMemo(userId: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const secureRandomStr = crypto.randomBytes(2).toString('hex');
  const memo = `d-${userId}-${Date.now()}-${secureRandomStr}`;

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
