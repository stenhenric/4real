import mongoose from 'mongoose';

import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import type { WithdrawalDocument, WithdrawalStatus } from '../repositories/withdrawal.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { WithdrawalDailyLimitRepository } from '../repositories/withdrawal-daily-limit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { findWithdrawalTransferOnChain } from './withdrawal-engine.ts';
import { getHotWalletRuntime } from './hot-wallet-runtime.service.ts';
import { AuditService } from './audit.service.ts';
import { ProductEmailNotificationService } from './product-email-notification.service.ts';
import { TransactionService } from './transaction.service.ts';
import { conflict, notFound, serviceUnavailable } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';

type WithdrawalRecoveryAction = 'confirm' | 'refund';

const ADMIN_REFUND_ERROR =
  'Admin refunded stuck withdrawal after chain re-check found no matching transfer';
const WITHDRAWAL_FAILED_USER_MESSAGE =
  'Withdrawal processing failed after retries. Your held balance was refunded.';

const defaultRecoveryDependencies = {
  findWithdrawalTransferOnChain,
};

const recoveryDependencies = {
  ...defaultRecoveryDependencies,
};

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function withdrawalStatusUrl(withdrawalId: string): string {
  return `/api/transactions/withdrawals/${encodeURIComponent(withdrawalId)}`;
}

function chainCheckTime(withdrawal: WithdrawalDocument): Date {
  const sentAt = withdrawal.sentAt ?? withdrawal.startedAt;
  if (!sentAt) {
    throw conflict(
      'Withdrawal does not have a send timestamp for chain reconciliation',
      'WITHDRAWAL_RECOVERY_MISSING_CHAIN_CHECK_TIME',
    );
  }

  return sentAt;
}

function isAdminRefunded(withdrawal: WithdrawalDocument): boolean {
  return withdrawal.status === 'failed' && withdrawal.lastError === ADMIN_REFUND_ERROR;
}

function requireWithdrawalId(withdrawal: WithdrawalDocument): NonNullable<WithdrawalDocument['_id']> {
  if (!withdrawal._id) {
    throw conflict('Withdrawal record is missing its document id', 'WITHDRAWAL_RECOVERY_INVALID_RECORD');
  }

  return withdrawal._id;
}

function assertActionAllowed(withdrawal: WithdrawalDocument, action: WithdrawalRecoveryAction): void {
  if (withdrawal.status === 'confirmed' && action === 'refund') {
    throw conflict('Confirmed withdrawal cannot be refunded', 'WITHDRAWAL_RECOVERY_ALREADY_CONFIRMED');
  }

  if (withdrawal.status === 'failed' && action === 'confirm') {
    throw conflict('Refunded withdrawal cannot be confirmed', 'WITHDRAWAL_RECOVERY_ALREADY_REFUNDED');
  }

  if (withdrawal.status !== 'stuck') {
    throw conflict('Only stuck withdrawals can be recovered by this action', 'WITHDRAWAL_RECOVERY_STATUS_INVALID');
  }
}

export interface WithdrawalRecoveryResult {
  withdrawalId: string;
  action: WithdrawalRecoveryAction;
  status: WithdrawalStatus;
  chainChecked: boolean;
  idempotent: boolean;
  refunded?: boolean;
  txHash?: string;
  confirmedAt?: string;
}

export async function recoverStuckWithdrawal(params: {
  withdrawalId: string;
  action: WithdrawalRecoveryAction;
  actorUserId: string;
}): Promise<WithdrawalRecoveryResult> {
  const withdrawal = await WithdrawalRepository.findByWithdrawalId(params.withdrawalId);
  if (!withdrawal) {
    throw notFound('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
  }

  if (withdrawal.status === 'confirmed' && params.action === 'confirm') {
    return {
      withdrawalId: withdrawal.withdrawalId,
      action: params.action,
      status: 'confirmed',
      chainChecked: false,
      idempotent: true,
      ...(withdrawal.txHash ? { txHash: withdrawal.txHash } : {}),
      ...(withdrawal.confirmedAt ? { confirmedAt: withdrawal.confirmedAt.toISOString() } : {}),
    };
  }

  if (isAdminRefunded(withdrawal) && params.action === 'refund') {
    return {
      withdrawalId: withdrawal.withdrawalId,
      action: params.action,
      status: 'failed',
      chainChecked: false,
      idempotent: true,
      refunded: true,
    };
  }

  assertActionAllowed(withdrawal, params.action);

  const hotWalletAddress = getHotWalletRuntime().hotWalletAddress;
  let confirmed: Awaited<ReturnType<typeof findWithdrawalTransferOnChain>>;
  try {
    confirmed = await recoveryDependencies.findWithdrawalTransferOnChain({
      hotWalletAddress,
      sentAt: chainCheckTime(withdrawal),
      withdrawalId: withdrawal.withdrawalId,
      amountRaw: withdrawal.amountRaw,
      toAddress: withdrawal.toAddress,
    });
  } catch (error) {
    logger.warn('withdrawal.recovery_chain_check_failed', {
      withdrawalId: withdrawal.withdrawalId,
      action: params.action,
      error,
    });
    throw serviceUnavailable(
      'Withdrawal chain confirmation is temporarily unavailable. Try recovery again after the provider is healthy.',
      'WITHDRAWAL_RECOVERY_CHAIN_CHECK_UNAVAILABLE',
    );
  }

  if (params.action === 'refund') {
    if (confirmed) {
      throw conflict(
        'Withdrawal was found on-chain and cannot be refunded',
        'WITHDRAWAL_RECOVERY_CHAIN_CONFIRMED',
        { txHash: confirmed.txHash },
      );
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const marked = await WithdrawalRepository.markStuckRefunded(
          requireWithdrawalId(withdrawal),
          ADMIN_REFUND_ERROR,
          session,
        );
        if (!marked) {
          throw conflict('Withdrawal changed before refund could be applied', 'WITHDRAWAL_RECOVERY_STATE_CHANGED');
        }

        await UserBalanceRepository.refundWithdrawal(withdrawal.userId, withdrawal.amountRaw, session);

        const refundDayBucket = [
          withdrawal.createdAt.getUTCFullYear().toString(),
          (withdrawal.createdAt.getUTCMonth() + 1).toString().padStart(2, '0'),
          withdrawal.createdAt.getUTCDate().toString().padStart(2, '0'),
        ].join('-');
        await WithdrawalDailyLimitRepository.releaseReservation(
          withdrawal.userId,
          refundDayBucket,
          withdrawal.amountRaw,
          session,
        );

        await TransactionService.createTransaction({
          userId: withdrawal.userId,
          type: 'WITHDRAW_REFUND',
          amount: withdrawal.amountDisplay,
          referenceId: withdrawal.withdrawalId,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    await AuditService.record({
      eventType: 'withdrawal_refunded',
      actorUserId: params.actorUserId,
      targetUserId: withdrawal.userId,
      resourceType: 'withdrawal',
      resourceId: withdrawal.withdrawalId,
      metadata: {
        amountRaw: withdrawal.amountRaw,
        toAddress: withdrawal.toAddress,
        reason: ADMIN_REFUND_ERROR,
      },
    });
    await ProductEmailNotificationService.sendWithdrawalTransition({
      scenario: 'withdrawal_failed_user',
      userId: withdrawal.userId,
      withdrawalId: withdrawal.withdrawalId,
      amountUsdt: withdrawal.amountDisplay,
      toAddress: withdrawal.toAddress,
      lastError: WITHDRAWAL_FAILED_USER_MESSAGE,
      statusUrl: withdrawalStatusUrl(withdrawal.withdrawalId),
    });
    await ProductEmailNotificationService.sendWithdrawalMerchantAlert({
      scenario: 'withdrawal_failed_merchant',
      withdrawalId: withdrawal.withdrawalId,
      amountUsdt: withdrawal.amountDisplay,
      toAddress: withdrawal.toAddress,
      lastError: ADMIN_REFUND_ERROR,
    });

    return {
      withdrawalId: withdrawal.withdrawalId,
      action: params.action,
      status: 'failed',
      chainChecked: true,
      idempotent: false,
      refunded: true,
    };
  }

  if (!confirmed) {
    throw conflict('Withdrawal was not found on-chain', 'WITHDRAWAL_RECOVERY_NOT_FOUND_ON_CHAIN');
  }

  const session = await mongoose.startSession();
  let confirmedTransitionApplied = false;
  try {
    await session.withTransaction(async () => {
      const markedConfirmed = await WithdrawalRepository.markConfirmed(
        requireWithdrawalId(withdrawal),
        confirmed.txHash,
        confirmed.confirmedAt,
        session,
      );
      if (!markedConfirmed) {
        throw conflict('Withdrawal changed before confirmation could be applied', 'WITHDRAWAL_RECOVERY_STATE_CHANGED');
      }

      await ProcessedTransactionRepository.create({
        txHash: confirmed.txHash,
        processedAt: new Date(),
        type: 'withdrawal_confirm',
      }, session);

      await UserBalanceRepository.recordWithdrawalConfirmed(
        withdrawal.userId,
        withdrawal.amountRaw,
        session,
      );
      confirmedTransitionApplied = true;
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  if (!confirmedTransitionApplied) {
    const current = await WithdrawalRepository.findByWithdrawalId(params.withdrawalId);
    if (current?.status === 'confirmed') {
      return {
        withdrawalId: current.withdrawalId,
        action: params.action,
        status: 'confirmed',
        chainChecked: true,
        idempotent: true,
        ...(current.txHash ? { txHash: current.txHash } : {}),
        ...(current.confirmedAt ? { confirmedAt: current.confirmedAt.toISOString() } : {}),
      };
    }

    throw conflict('Withdrawal confirmation could not be applied', 'WITHDRAWAL_RECOVERY_STATE_CHANGED');
  }

  await AuditService.record({
    eventType: 'withdrawal_confirmed',
    actorUserId: params.actorUserId,
    targetUserId: withdrawal.userId,
    resourceType: 'withdrawal',
    resourceId: withdrawal.withdrawalId,
    metadata: {
      txHash: confirmed.txHash,
      confirmedAt: confirmed.confirmedAt.toISOString(),
      recoveredByAdmin: true,
    },
  });
  await ProductEmailNotificationService.sendWithdrawalTransition({
    scenario: 'withdrawal_confirmed_user',
    userId: withdrawal.userId,
    withdrawalId: withdrawal.withdrawalId,
    amountUsdt: withdrawal.amountDisplay,
    toAddress: withdrawal.toAddress,
    txHash: confirmed.txHash,
    statusUrl: withdrawalStatusUrl(withdrawal.withdrawalId),
  });

  return {
    withdrawalId: withdrawal.withdrawalId,
    action: params.action,
    status: 'confirmed',
    chainChecked: true,
    idempotent: false,
    txHash: confirmed.txHash,
    confirmedAt: confirmed.confirmedAt.toISOString(),
  };
}

export function resetWithdrawalRecoveryDependenciesForTests(): void {
  Object.assign(recoveryDependencies, defaultRecoveryDependencies);
}

export function setWithdrawalRecoveryDependenciesForTests(overrides: Partial<typeof defaultRecoveryDependencies>): void {
  Object.assign(recoveryDependencies, overrides);
}
