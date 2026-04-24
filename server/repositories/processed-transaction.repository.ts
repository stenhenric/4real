import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export interface ProcessedTransactionDocument {
  txHash: string;
  processedAt: Date;
  type: string;
}

export class ProcessedTransactionRepository {
  private static collection() {
    return getMongoCollection<ProcessedTransactionDocument>('processed_txs');
  }

  static async findSeenHashes(txHashes: string[]) {
    if (txHashes.length === 0) {
      return [];
    }

    return this.collection()
      .find({ txHash: { $in: txHashes } })
      .project<{ txHash: string }>({ txHash: 1, _id: 0 })
      .toArray();
  }

  static async create(document: ProcessedTransactionDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(document, session ? { session } : undefined);
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { processedAt: 1 }, expireAfterSeconds: 7_776_000 },
    ]);
  }
}
