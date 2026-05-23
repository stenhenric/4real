import type { TransactionDTO, TransactionFeedDTO } from '../../types/api';

export const BANK_TRANSACTION_PAGE_SIZE = 25;

export function mergeTransactionPages(
  currentTransactions: TransactionDTO[],
  nextTransactions: TransactionDTO[],
): TransactionDTO[] {
  const seen = new Set<string>();
  const merged: TransactionDTO[] = [];

  for (const transaction of [...currentTransactions, ...nextTransactions]) {
    if (seen.has(transaction._id)) {
      continue;
    }

    seen.add(transaction._id);
    merged.push(transaction);
  }

  return merged;
}

export function getHasMoreTransactions(feed: TransactionFeedDTO): boolean {
  return feed.items.length >= feed.pageSize;
}
