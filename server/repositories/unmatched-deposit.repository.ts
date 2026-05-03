import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export type UnmatchedDepositMemoStatus = 'missing' | 'inactive';
export type UnmatchedDepositResolutionAction = 'credited' | 'dismissed';

export interface UnmatchedDepositDocument {
  txHash: string;
  receivedRaw: string;
  comment: string;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: number;
  recordedAt: Date;
  memoStatus: UnmatchedDepositMemoStatus;
  candidateUserId?: string | null;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string | null;
  resolutionAction?: UnmatchedDepositResolutionAction;
  resolutionNote?: string | null;
  resolvedUserId?: string | null;
  updatedAt?: Date;
}

export class UnmatchedDepositRepository {
  private static collection() {
    return getMongoCollection<UnmatchedDepositDocument>('unmatched_deposits');
  }

  static async create(document: UnmatchedDepositDocument, session?: mongoose.ClientSession): Promise<void> {
    const now = new Date();
    await this.collection().insertOne({
      ...document,
      resolved: document.resolved ?? false,
      updatedAt: document.updatedAt ?? now,
    }, session ? { session } : undefined);
  }

  static async findByTxHash(txHash: string, session?: mongoose.ClientSession) {
    return this.collection().findOne({ txHash }, session ? { session } : undefined);
  }

  static async findOpenByTxHashes(txHashes: string[]): Promise<UnmatchedDepositDocument[]> {
    if (txHashes.length === 0) {
      return [];
    }

    return this.collection()
      .find({
        txHash: { $in: txHashes },
        resolved: { $ne: true },
      })
      .toArray();
  }

  static async countOpen(): Promise<number> {
    return this.collection().countDocuments({ resolved: { $ne: true } });
  }

  static async findByStatus(status: 'open' | 'resolved', limit: number): Promise<UnmatchedDepositDocument[]> {
    const filter = status === 'open'
      ? { resolved: { $ne: true } }
      : { resolved: true };

    return this.collection()
      .find(filter)
      .sort(status === 'open' ? { recordedAt: -1 } : { resolvedAt: -1, recordedAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async markResolved(params: {
    txHash: string;
    resolvedBy: string;
    action: UnmatchedDepositResolutionAction;
    note?: string | undefined;
    resolvedUserId?: string | null | undefined;
  }, session?: mongoose.ClientSession): Promise<boolean> {
    const now = new Date();
    const trimmedNote = params.note?.trim();
    const result = await this.collection().updateOne(
      { txHash: params.txHash, resolved: { $ne: true } },
      {
        $set: {
          resolved: true,
          resolvedAt: now,
          resolvedBy: params.resolvedBy,
          resolutionAction: params.action,
          resolutionNote: trimmedNote || null,
          resolvedUserId: params.resolvedUserId ?? null,
          updatedAt: now,
        },
      },
      session ? { session } : undefined,
    );

    return result.matchedCount === 1;
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { txHash: 1 }, unique: true },
      { key: { resolved: 1, recordedAt: -1 } },
      { key: { resolved: 1, resolvedAt: -1 } },
      { key: { recordedAt: -1 } },
    ]);
  }
}
