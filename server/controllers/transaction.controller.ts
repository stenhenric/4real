import { Response } from 'express';
import { Address } from '@ton/ton';
import { v4 as uuidv4 } from 'uuid';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { serializeLedgerTransaction, serializeWithdrawalStatus } from '../serializers/api.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { generateDepositMemo } from '../services/deposit-service.ts';
import { prepareTonConnectDeposit } from '../services/deposit-tonconnect.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { requestWithdrawal } from '../services/withdrawal-service.ts';
import { badRequest, notFound, unauthorized } from '../utils/http-error.ts';
import type {
  PrepareTonConnectDepositRequest,
  WithdrawRequest,
} from '../validation/request-schemas.ts';

export const getUserTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated');
  }

  const transactions = await TransactionService.getUnifiedTransactionsByUser(req.user.id);
  res.json(transactions);
};

export const getAllTransactions = async (_req: AuthRequest, res: Response): Promise<void> => {
  const transactions = await TransactionService.getAllTransactions();
  res.json(transactions.map((transaction) => serializeLedgerTransaction(transaction)));
};

export const generateDepositMemoHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated');
  }

  const result = await generateDepositMemo(req.user.id);
  res.json(result);
};

export const prepareTonConnectDepositHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated');
  }

  const { walletAddress, memo, amountUsdt } = req.body as PrepareTonConnectDepositRequest;

  try {
    Address.parse(walletAddress);
  } catch {
    throw badRequest('Invalid TON wallet address');
  }

  const prepared = await prepareTonConnectDeposit({
    userId: req.user.id,
    memo,
    walletAddress,
    amountUsdt,
  });

  res.json(prepared);
};

export const requestWithdrawalHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated');
  }

  const { toAddress, amountUsdt } = req.body as WithdrawRequest;

  try {
    Address.parse(toAddress);
  } catch {
    throw badRequest('Invalid TON destination address');
  }

  const withdrawalId = uuidv4();
  await requestWithdrawal({ userId: req.user.id, toAddress, amountUsdt, withdrawalId });

  const statusUrl = `/api/transactions/withdrawals/${encodeURIComponent(withdrawalId)}`;

  res.status(202).json({
    success: true,
    message: 'Withdrawal queued successfully',
    status: 'queued',
    withdrawalId,
    statusUrl,
  });
};

export const getWithdrawalStatusHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated');
  }

  const withdrawal = await WithdrawalRepository.findByWithdrawalIdForUser(req.params.withdrawalId, req.user.id);
  if (!withdrawal) {
    throw notFound('Withdrawal not found');
  }

  res.json(serializeWithdrawalStatus(withdrawal));
};
