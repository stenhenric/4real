import request from './api/apiClient';
import { createIdempotencyKey } from '../utils/idempotency';
import type {
  DepositMemoDTO,
  PreparedTonConnectDepositDTO,
  TransactionDTO,
  WithdrawRequestDTO,
  WithdrawalRequestAcceptedDTO,
} from '../types/api';

interface PrepareTonConnectDepositPayload {
  memo: string;
  walletAddress: string;
  amountUsdt: number;
}

export function getTransactions(signal?: AbortSignal) {
  return request<TransactionDTO[]>('/transactions', signal ? { signal } : undefined);
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
