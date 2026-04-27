import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export interface DepositDocument {
  txHash: string;
  userId: string;
  amountRaw: string;
  amountDisplay: string;
  comment: string;
  senderJettonWallet: string;
  senderAddress: string | null;
  txTime: Date;
  status: 'confirmed';
  createdAt: Date;
}

export class DepositRepository {
  private static collection() {
    return getMongoCollection<DepositDocument>('deposits');
  }

  static async create(document: DepositDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(document, session ? { session } : undefined);
  }

  static async findByTxHash(txHash: string, session?: mongoose.ClientSession) {
    return this.collection().findOne({ txHash }, session ? { session } : undefined);
  }

  static async findByUserId(userId: string) {
    return this.collection().find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
      { key: { txTime: -1 } },
    ]);
  }
}
