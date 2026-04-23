import mongoose from 'mongoose';
import crypto from 'crypto';

export async function generateDepositMemo(userId: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const memo = `d-${userId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  await db.collection('deposit_memos').insertOne({
    memo,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 3600_000), // expire after 24h
    used: false,
  });

  const hotWalletAddress = process.env.HOT_WALLET_ADDRESS;
  if (!hotWalletAddress) {
    throw new Error('HOT_WALLET_ADDRESS is not configured');
  }

  const deepLink = `ton://transfer/${hotWalletAddress}?text=${encodeURIComponent(memo)}`;

  return {
    memo,
    address: hotWalletAddress,
    deepLink,
    instructions: `Send USDT to ${hotWalletAddress} with comment: ${memo}`,
    expiresIn: '24 hours',
  };
}
