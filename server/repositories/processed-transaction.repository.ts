import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export type ProcessedTransactionType =
  | 'deposit'
  | 'deposit_reconciled_credit'
  | 'deposit_reconciled_dismiss'
  | 'deposit_rejected'
  | 'deposit_unmatched'
  | 'withdrawal_confirm';

export interface ProcessedTransactionDocument {
  txHash: string;
  processedAt: Date;
  type: ProcessedTransactionType;
  updatedAt?: Date;
}

interface ExistingMongoIndex {
  name?: string;
  key?: Record<string, unknown>;
  expireAfterSeconds?: unknown;
}

function isLegacyProcessedAtTtlIndex(index: ExistingMongoIndex): index is ExistingMongoIndex & { name: string } {
  return typeof index.name === 'string'
    && index.key?.processedAt === 1
    && typeof index.expireAfterSeconds === 'number';
}

function isIndexNotFoundError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && (
        ('codeName' in error && error.codeName === 'IndexNotFound')
        || ('code' in error && error.code === 27)
      ),
  );
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

  static async findByHash(txHash: string, session?: mongoose.ClientSession) {
    return this.collection().findOne({ txHash }, session ? { session } : undefined);
  }

  static async updateType(txHash: string, type: ProcessedTransactionType, session?: mongoose.ClientSession): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { txHash },
      {
        $set: {
          type,
          processedAt: now,
          updatedAt: now,
        },
      },
      session ? { session } : undefined,
    );
  }

  static async ensureIndexes(): Promise<void> {
    const collection = this.collection();
    const existingIndexes = await collection.indexes() as ExistingMongoIndex[];
    for (const index of existingIndexes) {
      if (isLegacyProcessedAtTtlIndex(index)) {
        try {
          await collection.dropIndex(index.name);
        } catch (error) {
          if (!isIndexNotFoundError(error)) {
            throw error;
          }
        }
      }
    }

    await collection.createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { processedAt: 1 } },
    ]);
  }
}
