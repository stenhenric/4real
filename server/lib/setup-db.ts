import mongoose from 'mongoose';

export async function setupIndexes() {
  const db = mongoose.connection.db;
  if (!db) {
      console.error("Database connection not ready for index setup.");
      return;
  }

  try {
      await db.collection('deposits').createIndexes([
        { key: { txHash: 1 }, unique: true },
        { key: { userId: 1, createdAt: -1 } },
      ]);

      await db.collection('withdrawals').createIndexes([
        { key: { withdrawalId: 1 }, unique: true },
        { key: { status: 1, createdAt: 1 } },
        { key: { userId: 1, createdAt: -1 } },
      ]);

      await db.collection('user_balances').createIndexes([
        { key: { userId: 1 }, unique: true },
      ]);

      await db.collection('processed_txs').createIndexes([
        { key: { txHash: 1 }, unique: true },
        { key: { processedAt: 1 }, expireAfterSeconds: 7_776_000 }, // 90d TTL
      ]);

      await db.collection('deposit_memos').createIndexes([
        { key: { memo: 1 }, unique: true },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // TTL auto-delete
      ]);

      console.log('All indexes created successfully.');
  } catch (error) {
      console.error('Error creating indexes:', error);
  }
}
