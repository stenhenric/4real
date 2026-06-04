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

export interface TransactionFeedState {
  transactions: TransactionDTO[];
  transactionPage: number;
  transactionsLoading: boolean;
  nextTransactionsLoading: boolean;
  hasMoreTransactions: boolean;
  transactionsError: string | null;
  nextTransactionsError: string | null;
}

export type TransactionFeedAction =
  | { type: 'INITIAL_LOAD_STARTED' }
  | { type: 'NEXT_PAGE_STARTED' }
  | { type: 'PAGE_LOADED'; feed: TransactionFeedDTO; replace: boolean }
  | { type: 'PAGE_FAILED'; replace: boolean; message: string }
  | { type: 'RESET_FOR_VIEW' }
  | { type: 'CLEAR_ERROR' };

export function createInitialTransactionFeedState(): TransactionFeedState {
  return {
    transactions: [],
    transactionPage: 0,
    transactionsLoading: false,
    nextTransactionsLoading: false,
    hasMoreTransactions: false,
    transactionsError: null,
    nextTransactionsError: null,
  };
}

export function transactionFeedReducer(
  state: TransactionFeedState,
  action: TransactionFeedAction,
): TransactionFeedState {
  switch (action.type) {
    case 'INITIAL_LOAD_STARTED':
      return {
        ...state,
        transactionsLoading: true,
        transactionsError: null,
      };
    case 'NEXT_PAGE_STARTED':
      return {
        ...state,
        nextTransactionsLoading: true,
        nextTransactionsError: null,
      };
    case 'PAGE_LOADED':
      return {
        ...state,
        transactions: action.replace
          ? mergeTransactionPages([], action.feed.items)
          : mergeTransactionPages(state.transactions, action.feed.items),
        transactionPage: action.feed.page,
        hasMoreTransactions: getHasMoreTransactions(action.feed),
        transactionsLoading: action.replace ? false : state.transactionsLoading,
        nextTransactionsLoading: action.replace ? state.nextTransactionsLoading : false,
        transactionsError: null,
        nextTransactionsError: null,
      };
    case 'PAGE_FAILED':
      return {
        ...state,
        transactionsLoading: action.replace ? false : state.transactionsLoading,
        nextTransactionsLoading: action.replace ? state.nextTransactionsLoading : false,
        transactionsError: action.replace ? action.message : state.transactionsError,
        nextTransactionsError: action.replace ? state.nextTransactionsError : action.message,
      };
    case 'RESET_FOR_VIEW':
      return createInitialTransactionFeedState();
    case 'CLEAR_ERROR':
      return {
        ...state,
        transactionsError: null,
        nextTransactionsError: null,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
