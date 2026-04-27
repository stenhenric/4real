import type mongoose from 'mongoose';

import type { TelegramOrderProof } from '../models/Order.ts';
import { getMongoCollection } from './mongo.repository.ts';

export interface OrderProofRelayDocument {
  userId: string;
  routeKey: string;
  requestHash: string;
  proof: TelegramOrderProof;
  createdAt: Date;
  updatedAt: Date;
}

export class OrderProofRelayRepository {
  private static collection() {
    return getMongoCollection<OrderProofRelayDocument>('order_proof_relays');
  }

  static async findByRequest(userId: string, routeKey: string, requestHash: string) {
    return this.collection().findOne({ userId, routeKey, requestHash });
  }

  static async create(document: OrderProofRelayDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(document, session ? { session } : undefined);
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { userId: 1, routeKey: 1, requestHash: 1 }, unique: true },
      { key: { createdAt: 1 }, expireAfterSeconds: 7 * 24 * 60 * 60 },
    ]);
  }
}
