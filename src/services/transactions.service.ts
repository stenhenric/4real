import request from './api/apiClient.ts';
import { createIdempotencyKey } from '../utils/idempotency.ts';
import type {
  DepositMemoDTO,
  PreparedTonConnectDepositDTO,
  TransactionFeedDTO,
  WithdrawRequestDTO,
  WithdrawalRequestAcceptedDTO,
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

  return request<TransactionFeedDTO>(endpoint, query.signal ? { signal: query.signal } : undefined);
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

export function createWithdrawal(payload: WithdrawRequestDTO) {
  return request<WithdrawalRequestAcceptedDTO>('/transactions/withdraw', {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
}
