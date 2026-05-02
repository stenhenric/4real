import type mongoose from 'mongoose';

import { decimalLikeToBigInt } from '../utils/money.ts';
import { getMongoCollection } from './mongo.repository.ts';

export type WithdrawalStatus = 'queued' | 'processing' | 'sent' | 'confirmed' | 'stuck' | 'failed';
export const ACCOUNTED_WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'queued',
  'processing',
  'sent',
  'stuck',
  'confirmed',
];

export interface WithdrawalDocument {
  _id?: mongoose.Types.ObjectId | string;
  withdrawalId: string;
  userId: string;
  toAddress: string;
  amountRaw: string;
  amountDisplay: string;
  status: WithdrawalStatus;
  createdAt: Date;
  retries: number;
  startedAt?: Date;
  sentAt?: Date;
  confirmedAt?: Date;
  updatedAt?: Date;
  seqno?: number;
  txHash?: string;
  lastError?: string;
}

type WithdrawalDocumentId = mongoose.Types.ObjectId | string;

export class WithdrawalRepository {
  private static collection() {
    return getMongoCollection<WithdrawalDocument>('withdrawals');
  }

  static async createQueued(document: Omit<WithdrawalDocument, 'status' | 'createdAt' | 'retries'>, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(
      {
        ...document,
        status: 'queued',
        createdAt: new Date(),
        retries: 0,
        updatedAt: new Date(),
      },
      session ? { session } : undefined,
    );
  }

  static async findByUserId(userId: string) {
    return this.collection().find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  static async findByWithdrawalIdForUser(withdrawalId: string, userId: string) {
    return this.collection().findOne({ withdrawalId, userId });
  }

  static async claimNextQueued(maxRetries: number) {
    return this.collection().findOneAndUpdate(
      { status: 'queued', retries: { $lt: maxRetries } },
      { $set: { status: 'processing', startedAt: new Date(), updatedAt: new Date() } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
  }

  static async markSent(id: WithdrawalDocumentId, seqno: number, sentAt: Date = new Date()): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: { status: 'sent', sentAt, updatedAt: new Date(), seqno },
        $unset: { lastError: '' },
      },
    );
  }

  static async markStuck(id: WithdrawalDocumentId, lastError: string, seqno?: number, sentAt?: Date): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: {
          status: 'stuck',
          lastError,
          updatedAt: new Date(),
          ...(seqno !== undefined ? { seqno } : {}),
          ...(sentAt ? { sentAt } : {}),
        },
      },
    );
  }

  static async markRetryState(id: WithdrawalDocumentId, status: 'queued' | 'failed', lastError: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: { status, lastError, updatedAt: new Date() },
        $inc: { retries: 1 },
        $unset: { sentAt: '', seqno: '', txHash: '', confirmedAt: '' },
      },
      session ? { session } : undefined,
    );
  }

  static async markConfirmed(id: WithdrawalDocumentId, txHash: string, confirmedAt: Date, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { _id: id, status: { $in: ['sent', 'stuck'] } },
      {
        $set: {
          status: 'confirmed',
          txHash,
          confirmedAt,
          updatedAt: new Date(),
        },
        $unset: { lastError: '' },
      },
      session ? { session } : undefined,
    );
  }

  static async findStaleProcessing(startedBefore: Date) {
    return this.collection().find({
      status: 'processing',
      startedAt: { $lt: startedBefore },
    }).toArray();
  }

  static async findPendingConfirmation(limit = 25) {
    return this.collection().find({
      status: { $in: ['sent', 'stuck'] },
      sentAt: { $exists: true },
      txHash: { $exists: false },
    }).sort({ sentAt: 1 }).limit(limit).toArray();
  }

  static async sumConfirmedRawBetween(userId: string, startAt: Date, endAt: Date): Promise<bigint> {
    return this.sumAccountedRawBetween(userId, startAt, endAt, ['confirmed'], 'confirmedAt');
  }

  static async sumAccountedRawBetween(
    userId: string,
    startAt: Date,
    endAt: Date,
    statuses: readonly WithdrawalStatus[] = ACCOUNTED_WITHDRAWAL_STATUSES,
    timestampField: 'createdAt' | 'confirmedAt' = 'createdAt',
  ): Promise<bigint> {
    const [row] = await this.collection().aggregate<{ total: { toString: () => string } }>([
      {
        $match: {
          userId,
          status: { $in: [...statuses] },
          [timestampField]: {
            $gte: startAt,
            $lt: endAt,
          },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $toDecimal: '$amountRaw',
            },
          },
        },
      },
    ]).toArray();

    return row ? decimalLikeToBigInt(row.total) : 0n;
  }

  static async requeueByIds(ids: readonly mongoose.Types.ObjectId[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.collection().updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'queued', updatedAt: new Date() } },
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { withdrawalId: 1 }, unique: true },
      { key: { status: 1, createdAt: 1 } },
      { key: { status: 1, sentAt: 1 } },
      { key: { userId: 1, createdAt: -1 } },
      { key: { txHash: 1 }, sparse: true },
    ]);
  }
}
