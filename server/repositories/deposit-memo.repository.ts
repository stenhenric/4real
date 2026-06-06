import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

const DEPOSIT_MEMO_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export interface DepositMemoDocument {
  userId: string;
  memo: string;
  createdAt: Date;
  expiresAt: Date;
  used?: boolean;
  usedAt?: Date;
}

export class DepositMemoRepository {
  private static collection() {
    return getMongoCollection<DepositMemoDocument>('deposit_memos');
  }

  static async create(document: DepositMemoDocument): Promise<void> {
    await this.collection().insertOne(document);
  }

  static async findByUserAndMemo(userId: string, memo: string) {
    return this.collection().findOne({ userId, memo });
  }

  static async findByMemos(memos: string[]) {
    if (memos.length === 0) {
      return [];
    }

    return this.collection().find({ memo: { $in: memos } }).toArray();
  }

  static async claimActiveMemo(memo: string, session?: mongoose.ClientSession, validAt: Date = new Date()) {
    return this.collection().findOneAndUpdate(
      {
        memo,
        used: { $ne: true },
        expiresAt: { $gt: validAt },
      },
      { $set: { used: true, usedAt: new Date() } },
      {
        returnDocument: 'after',
        ...(session ? { session } : {}),
      },
    );
  }

  static async markUsed(memo: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { memo },
      { $set: { used: true, usedAt: new Date() } },
      session ? { session } : undefined,
    );
  }

  static async ensureIndexes(): Promise<void> {
    const collection = this.collection();
    try {
      const indexes = await collection.indexes();
      const legacyExpiryIndex = indexes.find((index) => (
        index.key?.expiresAt === 1
        && index.expireAfterSeconds !== DEPOSIT_MEMO_RETENTION_SECONDS
      ));
      if (legacyExpiryIndex?.name) {
        await collection.dropIndex(legacyExpiryIndex.name);
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 26 && code !== 27) {
        throw error;
      }
    }

    await collection.createIndexes([
      { key: { memo: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: DEPOSIT_MEMO_RETENTION_SECONDS },
    ]);
  }
}
