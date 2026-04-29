import { getMongoCollection } from './mongo.repository.ts';
import type { JettonTransferEvent } from '../services/deposit-ingestion.service.ts';

export type FailedDepositIngestionStatus = 'pending' | 'resolved' | 'terminal_failure';

export interface FailedDepositIngestionDocument {
  txHash: string;
  transferData: JettonTransferEvent;
  failedAt: Date;
  retryCount: number;
  lastError: string;
  status: FailedDepositIngestionStatus;
  nextRetryAt: Date;
  resolvedAt: Date | null;
  terminalFailureAt: Date | null;
  updatedAt: Date;
}

export class FailedDepositIngestionRepository {
  private static collection() {
    return getMongoCollection<FailedDepositIngestionDocument>('failed_deposit_ingestions');
  }

  static async upsertFailure(params: {
    txHash: string;
    transferData: JettonTransferEvent;
    lastError: string;
  }): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { txHash: params.txHash },
      {
        $setOnInsert: {
          txHash: params.txHash,
          failedAt: now,
          retryCount: 0,
        },
        $set: {
          transferData: params.transferData,
          lastError: params.lastError,
          status: 'pending',
          nextRetryAt: now,
          resolvedAt: null,
          terminalFailureAt: null,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }

  static async findByTxHashes(txHashes: string[]): Promise<FailedDepositIngestionDocument[]> {
    if (txHashes.length === 0) {
      return [];
    }

    return this.collection().find({ txHash: { $in: txHashes } }).toArray();
  }

  static async findEarliestPendingTransactionTime(): Promise<number | null> {
    const pending = await this.collection()
      .find({
        status: 'pending',
        resolvedAt: null,
      })
      .sort({ 'transferData.transaction_now': 1 })
      .limit(1)
      .next();

    if (!pending) {
      return null;
    }

    return pending.transferData.transaction_now;
  }

  static async findRetryable(now: Date, maxRetries: number, limit: number): Promise<FailedDepositIngestionDocument[]> {
    return this.collection()
      .find({
        status: 'pending',
        resolvedAt: null,
        retryCount: { $lt: maxRetries },
        nextRetryAt: { $lte: now },
      })
      .sort({ failedAt: 1 })
      .limit(limit)
      .toArray();
  }

  static async markResolved(txHash: string): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { txHash },
      {
        $set: {
          status: 'resolved',
          resolvedAt: now,
          updatedAt: now,
        },
      },
    );
  }

  static async markRetryScheduled(params: {
    txHash: string;
    retryCount: number;
    lastError: string;
    nextRetryAt: Date;
  }): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { txHash: params.txHash },
      {
        $set: {
          status: 'pending',
          retryCount: params.retryCount,
          lastError: params.lastError,
          nextRetryAt: params.nextRetryAt,
          updatedAt: now,
        },
      },
    );
  }

  static async markTerminalFailure(params: {
    txHash: string;
    retryCount: number;
    lastError: string;
  }): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { txHash: params.txHash },
      {
        $set: {
          status: 'terminal_failure',
          retryCount: params.retryCount,
          lastError: params.lastError,
          terminalFailureAt: now,
          updatedAt: now,
        },
      },
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { status: 1, resolvedAt: 1, nextRetryAt: 1, failedAt: 1 } },
      { key: { 'transferData.transaction_now': 1, status: 1, resolvedAt: 1 } },
    ]);
  }
}
