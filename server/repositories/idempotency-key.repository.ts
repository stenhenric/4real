import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export type IdempotencyStatus = 'processing' | 'completed';

export interface IdempotencyKeyDocument {
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatusCode?: number;
  responseBody?: unknown;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class IdempotencyKeyRepository {
  private static collection() {
    return getMongoCollection<IdempotencyKeyDocument>('idempotency_keys');
  }

  static async findByKey(userId: string, routeKey: string, idempotencyKey: string) {
    return this.collection().findOne({ userId, routeKey, idempotencyKey });
  }

  static async createProcessing(document: Pick<
    IdempotencyKeyDocument,
    'userId' | 'routeKey' | 'idempotencyKey' | 'requestHash'
  >, session?: mongoose.ClientSession): Promise<void> {
    const now = new Date();
    await this.collection().insertOne({
      ...document,
      status: 'processing',
      createdAt: now,
      updatedAt: now,
    }, session ? { session } : undefined);
  }

  static async markCompleted(
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    responseStatusCode: number,
    responseBody: unknown,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { userId, routeKey, idempotencyKey },
      {
        $set: {
          status: 'completed',
          responseStatusCode,
          responseBody,
          updatedAt: now,
          completedAt: now,
        },
      },
      session ? { session } : undefined,
    );
  }

  static async deleteProcessing(
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<void> {
    await this.collection().deleteOne({
      userId,
      routeKey,
      idempotencyKey,
      requestHash,
      status: 'processing',
    });
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { userId: 1, routeKey: 1, idempotencyKey: 1 }, unique: true },
      { key: { createdAt: 1 }, expireAfterSeconds: 7 * 24 * 60 * 60 },
    ]);
  }
}
