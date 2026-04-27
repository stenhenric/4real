import type { TransactionDTO } from '../../types/api';

const CREDIT_TRANSACTION_TYPES = new Set<TransactionDTO['type']>([
  'DEPOSIT',
  'WITHDRAW_REFUND',
  'MATCH_WIN',
  'MATCH_DRAW',
  'MATCH_REFUND',
  'SELL_P2P_REFUND',
]);

export function isCreditTransaction(transaction: Pick<TransactionDTO, 'type' | 'amount'>): boolean {
  return transaction.amount > 0 || CREDIT_TRANSACTION_TYPES.has(transaction.type);
}

export function getTransactionAccentClass(transaction: Pick<TransactionDTO, 'type' | 'amount'>): string {
  return isCreditTransaction(transaction) ? 'bg-green-600' : 'bg-red-600';
}
