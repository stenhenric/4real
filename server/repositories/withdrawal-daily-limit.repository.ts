import type mongoose from 'mongoose';
import { getMongoCollection } from './mongo.repository.ts';

export interface WithdrawalDailyLimitDocument {
  userId: string;
  dayBucket: string;
  reservedRaw: string;
  limitRaw: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WithdrawalDailyLimitRepository {
  private static collection() {
    return getMongoCollection<WithdrawalDailyLimitDocument>('withdrawal_daily_limits');
  }

  static async reserveIfWithinLimit(
    userId: string,
    dayBucket: string,
    amountRaw: string,
    limitRaw: string,
    session?: mongoose.ClientSession,
  ): Promise<WithdrawalDailyLimitDocument | null> {
    const now = new Date();

    // Ensure document exists first
    await this.collection().updateOne(
      { userId, dayBucket },
      {
        $setOnInsert: {
          reservedRaw: '0',
          limitRaw,
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );

    // Atomically try to increment reservedRaw only if within limit
    const result = await this.collection().findOneAndUpdate(
      {
        userId,
        dayBucket,
        $expr: {
          $lte: [
            { $add: [{ $toDouble: '$reservedRaw' }, { $toDouble: amountRaw }] },
            { $toDouble: limitRaw },
          ],
        },
      },
      [{
        $set: {
          reservedRaw: { $toString: { $add: [{ $toLong: '$reservedRaw' }, { $toLong: amountRaw }] } },
          limitRaw,
          updatedAt: now,
        },
      }],
      {
        returnDocument: 'after',
        ...(session ? { session } : {}),
      },
    );

    return result;
  }

  static async releaseReservation(
    userId: string,
    dayBucket: string,
    amountRaw: string,
    session?: mongoose.ClientSession,
  ): Promise<boolean> {
    const now = new Date();

    const result = await this.collection().findOneAndUpdate(
      { userId, dayBucket },
      [{
        $set: {
          reservedRaw: {
            $toString: {
              $max: [
                { $subtract: [{ $toLong: '$reservedRaw' }, { $toLong: amountRaw }] },
                0,
              ],
            },
          },
          updatedAt: now,
        },
      }],
      {
        returnDocument: 'after',
        ...(session ? { session } : {}),
      },
    );

    return result !== null;
  }

  static async findByUserAndDay(
    userId: string,
    dayBucket: string,
    session?: mongoose.ClientSession,
  ): Promise<WithdrawalDailyLimitDocument | null> {
    return this.collection().findOne(
      { userId, dayBucket },
      session ? { session } : undefined,
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { userId: 1, dayBucket: 1 }, unique: true },
    ]);
  }
}
