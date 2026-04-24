import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export interface UserBalanceDocument {
  userId: string;
  balanceRaw: string;
  totalDepositedRaw: string;
  totalWithdrawnRaw: string;
  createdAt: Date;
  updatedAt: Date;
}

function parseRaw(value?: string): bigint {
  return BigInt(value ?? '0');
}

export class UserBalanceRepository {
  private static collection() {
    return getMongoCollection<UserBalanceDocument>('user_balances');
  }

  static async findByUserId(userId: string, session?: mongoose.ClientSession) {
    return this.collection().findOne({ userId }, session ? { session } : undefined);
  }

  static async ensureExists(userId: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      {
        $setOnInsert: {
          balanceRaw: '0',
          totalDepositedRaw: '0',
          totalWithdrawnRaw: '0',
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async setBalanceRaw(userId: string, balanceRaw: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      {
        $set: { balanceRaw, updatedAt: new Date() },
        $setOnInsert: {
          createdAt: new Date(),
          totalDepositedRaw: '0',
          totalWithdrawnRaw: '0',
        },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async creditDeposit(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    const current = await this.findByUserId(userId, session);
    const nextBalanceRaw = (parseRaw(current?.balanceRaw) + BigInt(amountRaw)).toString();
    const nextTotalDepositedRaw = (parseRaw(current?.totalDepositedRaw) + BigInt(amountRaw)).toString();

    await this.collection().updateOne(
      { userId },
      {
        $set: {
          balanceRaw: nextBalanceRaw,
          totalDepositedRaw: nextTotalDepositedRaw,
          totalWithdrawnRaw: current?.totalWithdrawnRaw ?? '0',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async recordWithdrawalConfirmed(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    const current = await this.findByUserId(userId, session);

    await this.collection().updateOne(
      { userId },
      {
        $set: {
          balanceRaw: current?.balanceRaw ?? '0',
          totalDepositedRaw: current?.totalDepositedRaw ?? '0',
          totalWithdrawnRaw: (parseRaw(current?.totalWithdrawnRaw) + BigInt(amountRaw)).toString(),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async refundWithdrawal(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    const current = await this.findByUserId(userId, session);
    const nextBalanceRaw = (parseRaw(current?.balanceRaw) + BigInt(amountRaw)).toString();

    await this.collection().updateOne(
      { userId },
      {
        $set: {
          balanceRaw: nextBalanceRaw,
          totalDepositedRaw: current?.totalDepositedRaw ?? '0',
          totalWithdrawnRaw: current?.totalWithdrawnRaw ?? '0',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async sumBalanceRaw(): Promise<bigint> {
    const balances = await this.collection()
      .find({})
      .project<Pick<UserBalanceDocument, 'balanceRaw'>>({ balanceRaw: 1, _id: 0 })
      .toArray();

    return balances.reduce((total, document) => total + parseRaw(document.balanceRaw), 0n);
  }

  static async deleteAll(): Promise<void> {
    await this.collection().deleteMany({});
  }

  static async insertMany(documents: UserBalanceDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.collection().insertMany(documents);
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { userId: 1 }, unique: true },
    ]);
  }
}
