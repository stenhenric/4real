import { ensureAuthSessionIndexes } from '../models/AuthSession.ts';
import { Match } from '../models/Match.ts';
import { OneTimeToken } from '../models/OneTimeToken.ts';
import { Order } from '../models/Order.ts';
import { Transaction } from '../models/Transaction.ts';
import { User } from '../models/User.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { FailedDepositIngestionRepository } from '../repositories/failed-deposit-ingestion.repository.ts';
import { getMongoDb } from '../repositories/mongo.repository.ts';
import { JettonWalletCacheRepository } from '../repositories/jetton-wallet-cache.repository.ts';
import { AuditEventRepository } from '../repositories/audit-event.repository.ts';
import { DistributedLockRepository } from '../repositories/distributed-lock.repository.ts';
import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { OrderProofRelayRepository } from '../repositories/order-proof-relay.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { logger } from '../utils/logger.ts';

export const REQUIRED_DATABASE_INDEXES = [
  { collection: 'orders', name: 'createdAt_-1' },
  { collection: 'orders', name: 'type_1_createdAt_-1' },
  { collection: 'orders', name: 'status_1_type_1_createdAt_-1' },
  { collection: 'transactions', name: 'createdAt_-1__id_-1' },
  { collection: 'withdrawals', name: 'status_1_startedAt_1' },
  {
    collection: FailedDepositIngestionRepository.collectionName,
    name: 'status_1_resolvedAt_1_transferData.transaction_now_1',
  },
  {
    collection: FailedDepositIngestionRepository.collectionName,
    name: 'status_1_resolvedAt_1_nextRetryAt_1_failedAt_1',
  },
] as const;

export async function verifyRequiredIndexes(): Promise<void> {
  const db = getMongoDb();
  const indexesByCollection = new Map<string, Set<string>>();

  await Promise.all(REQUIRED_DATABASE_INDEXES.map(async ({ collection }) => {
    if (indexesByCollection.has(collection)) {
      return;
    }

    const indexNames = new Set(
      (await db.collection(collection).indexes()).map((index) => index.name).filter((name): name is string => (
        typeof name === 'string' && name.length > 0
      )),
    );
    indexesByCollection.set(collection, indexNames);
  }));

  const missing = REQUIRED_DATABASE_INDEXES.filter(({ collection, name }) => (
    !indexesByCollection.get(collection)?.has(name)
  ));

  if (missing.length > 0) {
    logger.error('database.indexes_missing', {
      missing: missing.map((index) => `${index.collection}.${index.name}`),
    });
    throw new Error(`Missing required MongoDB indexes: ${missing.map((index) => `${index.collection}.${index.name}`).join(', ')}`);
  }

  logger.info('database.indexes_verified', {
    indexes: REQUIRED_DATABASE_INDEXES.map((index) => `${index.collection}.${index.name}`),
  });
}

export async function setupIndexes() {
  await Promise.all([
    DepositRepository.ensureIndexes(),
    WithdrawalRepository.ensureIndexes(),
    UserBalanceRepository.ensureIndexes(),
    AuditEventRepository.ensureIndexes(),
    DistributedLockRepository.ensureIndexes(),
    IdempotencyKeyRepository.ensureIndexes(),
    OrderProofRelayRepository.ensureIndexes(),
    ProcessedTransactionRepository.ensureIndexes(),
    DepositMemoRepository.ensureIndexes(),
    PollerStateRepository.ensureIndexes(),
    JettonWalletCacheRepository.ensureIndexes(),
    UnmatchedDepositRepository.ensureIndexes(),
    FailedDepositIngestionRepository.ensureIndexes(),
    ensureAuthSessionIndexes(),
    User.createIndexes(),
    OneTimeToken.createIndexes(),
    Match.createIndexes(),
    Order.createIndexes(),
    Transaction.createIndexes(),
  ]);

  logger.info('database.indexes_ready');
  await verifyRequiredIndexes();
}
