import { Match } from '../models/Match.ts';
import { Order } from '../models/Order.ts';
import { Transaction } from '../models/Transaction.ts';
import { User } from '../models/User.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { JettonWalletCacheRepository } from '../repositories/jetton-wallet-cache.repository.ts';
import { AuditEventRepository } from '../repositories/audit-event.repository.ts';
import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { logger } from '../utils/logger.ts';

export async function setupIndexes() {
  await Promise.all([
    DepositRepository.ensureIndexes(),
    WithdrawalRepository.ensureIndexes(),
    UserBalanceRepository.ensureIndexes(),
    AuditEventRepository.ensureIndexes(),
    IdempotencyKeyRepository.ensureIndexes(),
    ProcessedTransactionRepository.ensureIndexes(),
    DepositMemoRepository.ensureIndexes(),
    PollerStateRepository.ensureIndexes(),
    JettonWalletCacheRepository.ensureIndexes(),
    UnmatchedDepositRepository.ensureIndexes(),
    User.createIndexes(),
    Match.createIndexes(),
    Order.createIndexes(),
    Transaction.createIndexes(),
  ]);

  logger.info('database.indexes_ready');
}
