import mongoose from 'mongoose';

import connectDB, { disconnectDB } from '../config/db.ts';
import type { UserBalanceDocument } from '../repositories/user-balance.repository.ts';
import { getMongoCollection } from '../repositories/mongo.repository.ts';
import { decimal128FromRaw, parseRawAmount } from '../utils/money.ts';
import { logger } from '../utils/logger.ts';

const BATCH_SIZE = 1_000;
const BATCH_SLEEP_MS = 50;

type UserBalanceMigrationDocument = UserBalanceDocument & {
  _id: mongoose.Types.ObjectId;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function backfillAtomicBalances(): Promise<void> {
  const collection = getMongoCollection<UserBalanceMigrationDocument>('user_balances');
  let migrated = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  while (true) {
    const filter: mongoose.mongo.Filter<UserBalanceMigrationDocument> = lastId ? { _id: { $gt: lastId } } : {};
    const batch: UserBalanceMigrationDocument[] = await collection
      .find(filter)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray();

    if (batch.length === 0) {
      break;
    }

    await collection.bulkWrite(
      batch.map((document: UserBalanceMigrationDocument) => {
        const balanceRaw = parseRawAmount(document.balanceRaw).toString();
        const totalDepositedRaw = parseRawAmount(document.totalDepositedRaw).toString();
        const totalWithdrawnRaw = parseRawAmount(document.totalWithdrawnRaw).toString();

        return {
          updateOne: {
            filter: { _id: document._id },
            update: {
              $set: {
                balanceAtomic: decimal128FromRaw(balanceRaw),
                totalDepositedAtomic: decimal128FromRaw(totalDepositedRaw),
                totalWithdrawnAtomic: decimal128FromRaw(totalWithdrawnRaw),
                updatedAt: new Date(),
              },
            },
          },
        };
      }),
    );

    migrated += batch.length;
    lastId = batch[batch.length - 1]?._id ?? null;

    logger.info('balance_atomic.backfill_batch_completed', {
      migrated,
      lastId: lastId?.toString(),
    });

    await sleep(BATCH_SLEEP_MS);
  }

  const totalDocuments = await collection.countDocuments();
  const missingAtomicDocuments = await collection.countDocuments({
    $or: [
      { balanceAtomic: { $exists: false } },
      { totalDepositedAtomic: { $exists: false } },
      { totalWithdrawnAtomic: { $exists: false } },
    ],
  });

  logger.info('balance_atomic.backfill_completed', {
    totalDocuments,
    migrated,
    missingAtomicDocuments,
  });

  if (missingAtomicDocuments > 0) {
    throw new Error(`Backfill incomplete: ${missingAtomicDocuments} balance documents still missing atomic fields`);
  }
}

async function main(): Promise<void> {
  await connectDB();
  try {
    await backfillAtomicBalances();
  } finally {
    await disconnectDB();
  }
}

void main().catch((error) => {
  logger.error('balance_atomic.backfill_failed', {
    error,
  });
  process.exit(1);
});
