import request from './api/apiClient.ts';
import { createIdempotencyKey } from '../utils/idempotency.ts';
import type {
  DepositMemoDTO,
  PreparedTonConnectDepositDTO,
  TransactionFeedDTO,
  WithdrawRequestDTO,
  WithdrawalRequestAcceptedDTO,
  WithdrawalStatusDTO,
} from '../types/api';

interface PrepareTonConnectDepositPayload {
  memo: string;
  walletAddress: string;
  amountUsdt: string;
}

export function getTransactions(query: {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
} = {}) {
  const params = new URLSearchParams();
  if (query.page) {
    params.set('page', String(query.page));
  }
  if (query.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }

  const queryString = params.toString();
  const endpoint = queryString.length > 0
    ? `/transactions?${queryString}`
    : '/transactions';

  return request<TransactionFeedDTO | null>(endpoint, query.signal ? { signal: query.signal } : undefined)
    .then((feed) => ({
      items: Array.isArray(feed?.items) ? feed.items : [],
      page: typeof feed?.page === 'number' ? feed.page : (query.page ?? 1),
      pageSize: typeof feed?.pageSize === 'number' ? feed.pageSize : (query.pageSize ?? 0),
      total: typeof feed?.total === 'number' ? feed.total : 0,
    }));
}

export function createDepositMemo() {
  return request<DepositMemoDTO>('/transactions/deposit/memo', { method: 'POST' });
}

export function prepareTonConnectDeposit(payload: PrepareTonConnectDepositPayload) {
  return request<PreparedTonConnectDepositDTO>('/transactions/deposit/prepare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createWithdrawal(payload: WithdrawRequestDTO, options?: { idempotencyKey?: string }) {
  return request<WithdrawalRequestAcceptedDTO>('/transactions/withdraw', {
    method: 'POST',
    headers: {
      'Idempotency-Key': options?.idempotencyKey ?? createIdempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
}

export function getWithdrawalStatus(withdrawalId: string, signal?: AbortSignal) {
  return request<WithdrawalStatusDTO>(
    `/transactions/withdrawals/${encodeURIComponent(withdrawalId)}`,
    signal ? { signal } : undefined,
  );
}
