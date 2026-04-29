import { Response } from 'express';
import { Address } from '@ton/ton';
import { v4 as uuidv4 } from 'uuid';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeLedgerTransaction, serializeWithdrawalStatus } from '../serializers/api.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { generateDepositMemo } from '../services/deposit-service.ts';
import { prepareTonConnectDeposit } from '../services/deposit-tonconnect.service.ts';
import { AuditService } from '../services/audit.service.ts';
import { executeIdempotentMutationV2 } from '../services/idempotency.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { requestWithdrawal } from '../services/withdrawal-service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import { badRequest, notFound } from '../utils/http-error.ts';
import type {
  PrepareTonConnectDepositRequest,
  WithdrawRequest,
} from '../validation/request-schemas.ts';

export const getUserTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  assertAuthenticated(req);
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
  assertAuthenticated(req);
  const result = await generateDepositMemo(req.user.id);
  res.json(result);
};

export const prepareTonConnectDepositHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  assertAuthenticated(req);

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
  assertAuthenticated(req);
  const userId = req.user.id;
  const { toAddress, amountUsdt } = req.body as WithdrawRequest;
  const idempotencyKey = getRequiredIdempotencyKey(req);

  try {
    Address.parse(toAddress);
  } catch {
    throw badRequest('Invalid TON destination address', 'INVALID_TON_ADDRESS');
  }

  const result = await executeIdempotentMutationV2({
    userId,
    routeKey: 'transactions:withdraw',
    idempotencyKey,
    requestPayload: { toAddress, amountUsdt },
    execute: async ({ session }) => {
      const withdrawalId = uuidv4();
      await requestWithdrawal({ userId, toAddress, amountUsdt, withdrawalId, session });

      await AuditService.record({
        eventType: 'withdrawal_requested',
        actorUserId: userId,
        targetUserId: userId,
        resourceType: 'withdrawal',
        resourceId: withdrawalId,
        requestId: res.locals.requestId,
        metadata: {
          toAddress,
          amountUsdt,
        },
        session,
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
  assertAuthenticated(req);
  const withdrawalId = req.params.withdrawalId;
  if (!withdrawalId) {
    throw notFound('Withdrawal not found');
  }

  const withdrawal = await WithdrawalRepository.findByWithdrawalIdForUser(withdrawalId, req.user.id);
  if (!withdrawal) {
    throw notFound('Withdrawal not found');
  }

  res.json(serializeWithdrawalStatus(withdrawal));
};
