import { Response } from 'express';
import { Address } from '@ton/ton';
import { v4 as uuidv4 } from 'uuid';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { serializeLedgerTransaction, serializeWithdrawalStatus } from '../serializers/api.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { generateDepositMemo } from '../services/deposit-service.ts';
import { prepareTonConnectDeposit } from '../services/deposit-tonconnect.service.ts';
import { AuditService } from '../services/audit.service.ts';
import { executeIdempotentMutation } from '../services/idempotency.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { requestWithdrawal } from '../services/withdrawal-service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
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

export const getAllTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const transactions = await TransactionService.getAllTransactions(limit, offset);
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
    throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
  }

  const { toAddress, amountUsdt } = req.body as WithdrawRequest;
  const idempotencyKey = getRequiredIdempotencyKey(req);

  try {
    Address.parse(toAddress);
  } catch {
    throw badRequest('Invalid TON destination address', 'INVALID_TON_ADDRESS');
  }

  const result = await executeIdempotentMutation({
    userId: req.user.id,
    routeKey: 'transactions:withdraw',
    idempotencyKey,
    requestPayload: { toAddress, amountUsdt },
    execute: async () => {
      const withdrawalId = uuidv4();
      await requestWithdrawal({ userId: req.user!.id, toAddress, amountUsdt, withdrawalId });

      await AuditService.record({
        eventType: 'withdrawal_requested',
        actorUserId: req.user!.id,
        targetUserId: req.user!.id,
        resourceType: 'withdrawal',
        resourceId: withdrawalId,
        requestId: res.locals.requestId,
        metadata: {
          toAddress,
          amountUsdt,
        },
      });

      const statusUrl = `/api/transactions/withdrawals/${encodeURIComponent(withdrawalId)}`;

      return {
        statusCode: 202,
        body: {
          success: true,
          message: 'Withdrawal queued successfully',
          status: 'queued',
          withdrawalId,
          statusUrl,
        },
      };
    },
  });

  res.status(result.statusCode).json(result.body);
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
