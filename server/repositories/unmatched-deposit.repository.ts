import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export interface UnmatchedDepositDocument {
  txHash: string;
  receivedRaw: string;
  comment: string;
  senderJettonWallet: string;
  txTime: number;
  recordedAt: Date;
  resolved?: boolean;
}

export class UnmatchedDepositRepository {
  private static collection() {
    return getMongoCollection<UnmatchedDepositDocument>('unmatched_deposits');
  }

  static async create(document: UnmatchedDepositDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne({
      ...document,
      resolved: document.resolved ?? false,
    }, session ? { session } : undefined);
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { recordedAt: -1 } },
    ]);
  }
}
