import type mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { decimal128FromRaw, decimalLikeToBigInt, parseRawAmount } from '../utils/money.ts';
import { getMongoCollection } from './mongo.repository.ts';

export interface UserBalanceDocument {
  userId: string;
  balanceRaw: string;
  balanceAtomic?: mongoose.Types.Decimal128;
  totalDepositedRaw: string;
  totalDepositedAtomic?: mongoose.Types.Decimal128;
  totalWithdrawnRaw: string;
  totalWithdrawnAtomic?: mongoose.Types.Decimal128;
  createdAt: Date;
  updatedAt: Date;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function getAtomicFieldExpression(
  atomicField: keyof Pick<UserBalanceDocument, 'balanceAtomic' | 'totalDepositedAtomic' | 'totalWithdrawnAtomic'>,
  rawField: keyof Pick<UserBalanceDocument, 'balanceRaw' | 'totalDepositedRaw' | 'totalWithdrawnRaw'>,
): mongoose.mongo.Document {
  return {
    $ifNull: [
      `$${String(atomicField)}`,
      {
        $toDecimal: {
          $ifNull: [`$${String(rawField)}`, '0'],
        },
      },
    ],
  };
}

function buildMutationPipeline(params: {
  userId: string;
  balanceDeltaRaw?: string;
  totalDepositedDeltaRaw?: string;
  totalWithdrawnDeltaRaw?: string;
}): mongoose.mongo.Document[] {
  const now = new Date();
  const currentBalance = getAtomicFieldExpression('balanceAtomic', 'balanceRaw');
  const currentTotalDeposited = getAtomicFieldExpression('totalDepositedAtomic', 'totalDepositedRaw');
  const currentTotalWithdrawn = getAtomicFieldExpression('totalWithdrawnAtomic', 'totalWithdrawnRaw');
  const nextBalance = params.balanceDeltaRaw === undefined
    ? currentBalance
    : {
        $add: [currentBalance, decimal128FromRaw(params.balanceDeltaRaw)],
      };
  const nextTotalDeposited = params.totalDepositedDeltaRaw === undefined
    ? currentTotalDeposited
    : {
        $add: [currentTotalDeposited, decimal128FromRaw(params.totalDepositedDeltaRaw)],
      };
  const nextTotalWithdrawn = params.totalWithdrawnDeltaRaw === undefined
    ? currentTotalWithdrawn
    : {
        $add: [currentTotalWithdrawn, decimal128FromRaw(params.totalWithdrawnDeltaRaw)],
      };

  return [{
    $set: {
      userId: {
        $ifNull: ['$userId', params.userId],
      },
      balanceAtomic: nextBalance,
      balanceRaw: { $toString: nextBalance },
      totalDepositedAtomic: nextTotalDeposited,
      totalDepositedRaw: { $toString: nextTotalDeposited },
      totalWithdrawnAtomic: nextTotalWithdrawn,
      totalWithdrawnRaw: { $toString: nextTotalWithdrawn },
      createdAt: {
        $ifNull: ['$createdAt', now],
      },
      updatedAt: now,
    },
  }];
}

export interface UserBalanceSumOptions {
  excludeUserIds?: string[];
}

export class UserBalanceRepository {
  private static collection() {
    return getMongoCollection<UserBalanceDocument>('user_balances');
  }

  static async findByUserId(userId: string, session?: mongoose.ClientSession) {
    return this.collection().findOne({ userId }, session ? { session } : undefined);
  }

  static getBalanceRaw(document?: UserBalanceDocument | null): bigint {
    if (!document) {
      return 0n;
    }

    if (document.balanceAtomic) {
      return decimalLikeToBigInt(document.balanceAtomic);
    }

    return parseRawAmount(document.balanceRaw);
  }

  static async ensureExists(userId: string, session?: mongoose.ClientSession, initialBalanceRaw = '0'): Promise<void> {
    const zeroDecimal = decimal128FromRaw(0);
    const initialBalanceDecimal = decimal128FromRaw(initialBalanceRaw);
    await this.collection().updateOne(
      { userId },
      {
        $setOnInsert: {
          balanceRaw: initialBalanceRaw,
          balanceAtomic: initialBalanceDecimal,
          totalDepositedRaw: '0',
          totalDepositedAtomic: zeroDecimal,
          totalWithdrawnRaw: '0',
          totalWithdrawnAtomic: zeroDecimal,
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async adjustBalanceRaw(userId: string, deltaRaw: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      buildMutationPipeline({
        userId,
        balanceDeltaRaw: deltaRaw,
      }),
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async creditDeposit(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      buildMutationPipeline({
        userId,
        balanceDeltaRaw: amountRaw,
        totalDepositedDeltaRaw: amountRaw,
      }),
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async recordWithdrawalConfirmed(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      buildMutationPipeline({
        userId,
        totalWithdrawnDeltaRaw: amountRaw,
      }),
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async refundWithdrawal(userId: string, amountRaw: string, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().updateOne(
      { userId },
      buildMutationPipeline({
        userId,
        balanceDeltaRaw: amountRaw,
      }),
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  static async deductBalanceRawIfSufficient(
    userId: string,
    amountRaw: string,
    session?: mongoose.ClientSession,
  ): Promise<UserBalanceDocument | null> {
    return this.collection().findOneAndUpdate(
      {
        userId,
        $expr: {
          $gte: [
            getAtomicFieldExpression('balanceAtomic', 'balanceRaw'),
            decimal128FromRaw(amountRaw),
          ],
        },
      },
      buildMutationPipeline({
        userId,
        balanceDeltaRaw: (-parseRawAmount(amountRaw)).toString(),
      }),
      {
        returnDocument: 'after',
        ...(session ? { session } : {}),
      },
    );
  }

  private static toSumFilter(options?: UserBalanceSumOptions): mongoose.mongo.Filter<UserBalanceDocument> {
    if (!options?.excludeUserIds?.length) {
      return {};
    }

    return { userId: { $nin: options.excludeUserIds } };
  }

  private static async sumBalanceRawLegacy(filter: mongoose.mongo.Filter<UserBalanceDocument>): Promise<bigint> {
    const balances = await this.collection()
      .find(filter)
      .project<Pick<UserBalanceDocument, 'balanceRaw'>>({ balanceRaw: 1, _id: 0 })
      .toArray();

    return balances.reduce((total, document) => total + parseRawAmount(document.balanceRaw), 0n);
  }

  static async sumBalanceRawAggregated(filter: mongoose.mongo.Filter<UserBalanceDocument>): Promise<bigint> {
    const [row] = await this.collection().aggregate<{ total: { toString: () => string } }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: {
            $sum: getAtomicFieldExpression('balanceAtomic', 'balanceRaw'),
          },
        },
      },
    ]).toArray();

    if (!row) {
      return 0n;
    }

    return decimalLikeToBigInt(row.total);
  }

  static async sumBalanceRawForLedger(options?: UserBalanceSumOptions): Promise<bigint> {
    const filter = this.toSumFilter(options);
    const env = getEnv();

    const aggregatedTotal = await this.sumBalanceRawAggregated(filter);

    if (!env.FEATURE_AGGREGATED_BALANCE_SUM) {
      return aggregatedTotal;
    }

    const legacyTotal = await this.sumBalanceRawLegacy(filter);

    const delta = absBigInt(aggregatedTotal - legacyTotal);
    if (delta > 0n) {
      logger.warn('user_balance.sum_mismatch', {
        aggregatedRaw: aggregatedTotal.toString(),
        legacyRaw: legacyTotal.toString(),
        deltaRaw: delta.toString(),
      });
    }

    return aggregatedTotal;
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
      { key: { balanceAtomic: 1 } },
    ]);
  }
}
