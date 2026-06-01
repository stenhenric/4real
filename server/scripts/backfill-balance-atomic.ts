import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';

import connectDB, { disconnectDB } from '../config/db.ts';
import type { UserBalanceDocument } from '../repositories/user-balance.repository.ts';
import { getMongoCollection } from '../repositories/mongo.repository.ts';
import { decimal128FromRaw, parseRawAmount } from '../utils/money.ts';
import { logger } from '../utils/logger.ts';

const BATCH_SIZE = 1_000;
const BATCH_SLEEP_MS = 50;
const CONFIRM_FLAG = '--confirm-balance-atomic-backfill';

type AtomicField = 'balanceAtomic' | 'totalDepositedAtomic' | 'totalWithdrawnAtomic';

type UserBalanceMigrationDocument = UserBalanceDocument & {
  _id: mongoose.Types.ObjectId;
};

export interface BackfillCliOptions {
  apply: boolean;
  allowProduction: boolean;
  confirmed: boolean;
  nodeEnv: string;
}

export interface BackfillSummary {
  totalDocuments: number;
  scanned: number;
  candidateDocuments: number;
  migrated: number;
  missingAtomicDocuments: number;
  dryRun: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFieldMissing(document: UserBalanceMigrationDocument, field: AtomicField): boolean {
  return document[field] === undefined || document[field] === null;
}

export function parseBackfillCliOptions(
  argv = process.argv.slice(2),
  env: Partial<Record<'NODE_ENV' | 'CONFIRM_BALANCE_ATOMIC_BACKFILL', string>> = process.env,
): BackfillCliOptions {
  const hasApply = argv.includes('--apply');
  const hasDryRun = argv.includes('--dry-run');
  if (hasApply && hasDryRun) {
    throw new Error('Use either --apply or --dry-run, not both.');
  }

  return {
    apply: hasApply,
    allowProduction: argv.includes('--allow-production'),
    confirmed: argv.includes(CONFIRM_FLAG) || env.CONFIRM_BALANCE_ATOMIC_BACKFILL === 'true',
    nodeEnv: env.NODE_ENV ?? 'development',
  };
}

export function assertBackfillCanRun(options: BackfillCliOptions): void {
  if (options.nodeEnv === 'production' && !options.allowProduction) {
    throw new Error('Balance atomic backfill refuses to run in production without --allow-production.');
  }

  if (options.apply && !options.confirmed) {
    throw new Error(`Balance atomic backfill --apply requires ${CONFIRM_FLAG}.`);
  }
}

export function buildAtomicBackfillOperation(document: UserBalanceMigrationDocument) {
  const filter: Record<string, unknown> = { _id: document._id };
  const set: Record<string, unknown> = {};

  if (isFieldMissing(document, 'balanceAtomic')) {
    filter.balanceAtomic = null;
    set.balanceAtomic = decimal128FromRaw(parseRawAmount(document.balanceRaw).toString());
  }

  if (isFieldMissing(document, 'totalDepositedAtomic')) {
    filter.totalDepositedAtomic = null;
    set.totalDepositedAtomic = decimal128FromRaw(parseRawAmount(document.totalDepositedRaw).toString());
  }

  if (isFieldMissing(document, 'totalWithdrawnAtomic')) {
    filter.totalWithdrawnAtomic = null;
    set.totalWithdrawnAtomic = decimal128FromRaw(parseRawAmount(document.totalWithdrawnRaw).toString());
  }

  if (Object.keys(set).length === 0) {
    return null;
  }

  set.updatedAt = new Date();

  return {
    updateOne: {
      filter,
      update: {
        $set: set,
      },
    },
  };
}

export async function backfillAtomicBalances(options: BackfillCliOptions): Promise<BackfillSummary> {
  assertBackfillCanRun(options);

  const collection = getMongoCollection<UserBalanceMigrationDocument>('user_balances');
  let scanned = 0;
  let candidateDocuments = 0;
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

    const operations = batch
      .map((document) => buildAtomicBackfillOperation(document))
      .filter((operation): operation is NonNullable<ReturnType<typeof buildAtomicBackfillOperation>> => (
        operation !== null
      ));

    scanned += batch.length;
    candidateDocuments += operations.length;

    if (options.apply && operations.length > 0) {
      const result = await collection.bulkWrite(operations);
      migrated += result.modifiedCount ?? 0;
    }

    lastId = batch[batch.length - 1]?._id ?? null;

    logger.info('balance_atomic.backfill_batch_completed', {
      dryRun: !options.apply,
      scanned,
      candidateDocuments,
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

  const summary = {
    totalDocuments,
    scanned,
    candidateDocuments,
    migrated,
    missingAtomicDocuments,
    dryRun: !options.apply,
  };

  logger.info('balance_atomic.backfill_completed', summary);

  if (options.apply && missingAtomicDocuments > 0) {
    throw new Error(`Backfill incomplete: ${missingAtomicDocuments} balance documents still missing atomic fields`);
  }

  return summary;
}

async function main(): Promise<void> {
  const options = parseBackfillCliOptions();
  assertBackfillCanRun(options);

  await connectDB();
  try {
    await backfillAtomicBalances(options);
  } finally {
    await disconnectDB();
  }
}

const invokedScriptPath = process.argv[1] ? fileURLToPath(import.meta.url) : null;
if (invokedScriptPath && process.argv[1] === invokedScriptPath) {
  void main().catch((error) => {
    logger.error('balance_atomic.backfill_failed', {
      error,
    });
    process.exit(1);
  });
}
