import type mongoose from 'mongoose';

import type { TelegramOrderProof } from '../models/Order.ts';
import { getMongoCollection } from './mongo.repository.ts';

export type OrderProofRelayStatus = 'pending' | 'processing' | 'completed' | 'terminal_failure';

export interface OrderProofRelayPayload {
  orderType: 'BUY' | 'SELL';
  amount: string;
  fiatCurrency: 'KES';
  exchangeRate: string;
  fiatTotal: string;
  transactionCode: string;
  username: string;
  userId: string;
  mimeType: string;
  filename: string;
  fileBase64: string;
}

export interface OrderProofRelayDocument {
  _id?: mongoose.Types.ObjectId | string;
  userId: string;
  routeKey: string;
  requestHash: string;
  orderId?: string;
  relay?: OrderProofRelayPayload;
  proof?: TelegramOrderProof;
  status?: OrderProofRelayStatus;
  attempts?: number;
  lastError?: string;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type OrderProofRelayDocumentId = mongoose.Types.ObjectId | string;

export class OrderProofRelayRepository {
  private static collection() {
    return getMongoCollection<OrderProofRelayDocument>('order_proof_relays');
  }

  static async findByRequest(
    userId: string,
    routeKey: string,
    requestHash: string,
    session?: mongoose.ClientSession,
  ) {
    return this.collection().findOne(
      { userId, routeKey, requestHash },
      session ? { session } : undefined,
    );
  }

  static async create(document: OrderProofRelayDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(document, session ? { session } : undefined);
  }

  static async createPending(
    document: Omit<OrderProofRelayDocument, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError'>,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await this.collection().insertOne(
      {
        ...document,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
      },
      session ? { session } : undefined,
    );
  }

  static async claimPendingByRequest(
    userId: string,
    routeKey: string,
    requestHash: string,
    now: Date = new Date(),
  ) {
    return this.collection().findOneAndUpdate(
      {
        userId,
        routeKey,
        requestHash,
        $and: [
          {
            $or: [{ status: 'pending' }, { status: { $exists: false } }],
          },
          {
            $or: [
              { nextAttemptAt: { $lte: now } },
              { nextAttemptAt: { $exists: false } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'processing',
          updatedAt: now,
        },
        $inc: { attempts: 1 },
        $unset: { lastError: '' },
      },
      { returnDocument: 'after' },
    );
  }

  static async claimNextPending(now: Date = new Date()) {
    return this.collection().findOneAndUpdate(
      {
        $and: [
          {
            $or: [{ status: 'pending' }, { status: { $exists: false } }],
          },
          {
            $or: [
              { nextAttemptAt: { $lte: now } },
              { nextAttemptAt: { $exists: false } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'processing',
          updatedAt: now,
        },
        $inc: { attempts: 1 },
        $unset: { lastError: '' },
      },
      {
        sort: { nextAttemptAt: 1, createdAt: 1 },
        returnDocument: 'after',
      },
    );
  }

  static async markCompleted(
    id: OrderProofRelayDocumentId,
    proof: TelegramOrderProof,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: {
          status: 'completed',
          proof,
          updatedAt: new Date(),
        },
        $unset: {
          lastError: '',
          nextAttemptAt: '',
          relay: '',
        },
      },
      session ? { session } : undefined,
    );
  }

  static async markRetry(
    id: OrderProofRelayDocumentId,
    lastError: string,
    nextAttemptAt: Date,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: {
          status: 'pending',
          lastError,
          nextAttemptAt,
          updatedAt: new Date(),
        },
      },
      session ? { session } : undefined,
    );
  }

  static async markTerminalFailure(
    id: OrderProofRelayDocumentId,
    lastError: string,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: id },
      {
        $set: {
          status: 'terminal_failure',
          lastError,
          updatedAt: new Date(),
        },
        $unset: {
          nextAttemptAt: '',
        },
      },
      session ? { session } : undefined,
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { userId: 1, routeKey: 1, requestHash: 1 }, unique: true },
      { key: { status: 1, nextAttemptAt: 1, createdAt: 1 } },
      { key: { orderId: 1 }, sparse: true },
      { key: { createdAt: 1 }, expireAfterSeconds: 7 * 24 * 60 * 60 },
    ]);
  }
}
