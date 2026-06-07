import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

import { getEnv } from '../config/env.ts';
import { MIN_WITHDRAWAL_USDT } from '../config/withdrawal-limits.ts';
import { WithdrawalDailyLimitRepository } from '../repositories/withdrawal-daily-limit.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { badRequest } from '../utils/http-error.ts';
import { recordWithdrawalBalanceHoldFailure } from './metrics.service.ts';
import { UserService } from './user.service.ts';
import { formatUsdtAmount, parseUsdtAmount } from '../utils/money.ts';

const MAX_TRANSACTION_RETRIES = 3;

const isTransientTransactionError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { errorLabels?: string[] };
  return Array.isArray(maybe.errorLabels) && maybe.errorLabels.includes('TransientTransactionError');
};

export async function requestWithdrawal({
  userId,
  toAddress,
  amountUsdt,
  withdrawalId,
  session,
}: {
  userId: string;
  toAddress: string;
  amountUsdt: string;
  withdrawalId: string;
  session?: ClientSession;
}) {
  const amountRawBigInt = parseUsdtAmount(amountUsdt);
  const minimumWithdrawalRaw = parseUsdtAmount(MIN_WITHDRAWAL_USDT);
  if (amountRawBigInt < minimumWithdrawalRaw) {
    throw badRequest(`Minimum withdrawal is ${MIN_WITHDRAWAL_USDT} USDT`, 'WITHDRAWAL_BELOW_MINIMUM');
  }

  const amountRaw = amountRawBigInt.toString();

  const executeWithdrawalMutation = async (activeSession: ClientSession) => {
    const updatedUser = await UserService.deductBalanceSafely(userId, amountUsdt, activeSession);
    if (!updatedUser) {
      recordWithdrawalBalanceHoldFailure('insufficient_balance');
      throw badRequest('Insufficient balance', 'INSUFFICIENT_BALANCE');
    }

    const now = new Date();
    const dayBucket = [
      now.getUTCFullYear().toString(),
      (now.getUTCMonth() + 1).toString().padStart(2, '0'),
      now.getUTCDate().toString().padStart(2, '0'),
    ].join('-');
    const dailyLimitRaw = parseUsdtAmount(getEnv().DAILY_WITHDRAWAL_LIMIT_USDT);
    const reserved = await WithdrawalDailyLimitRepository.reserveIfWithinLimit(
      userId,
      dayBucket,
      amountRaw,
      dailyLimitRaw.toString(),
      activeSession,
    );
    if (!reserved) {
      recordWithdrawalBalanceHoldFailure('daily_limit_exceeded');
      throw badRequest('Daily withdrawal limit exceeded', 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED');
    }

    await WithdrawalRepository.createQueued({
      withdrawalId,
      userId,
      toAddress,
      amountRaw,
      amountDisplay: formatUsdtAmount(amountRaw),
    }, activeSession);
  };

  if (session) {
    await executeWithdrawalMutation(session);
    return;
  }

  for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
    const ownSession = await mongoose.startSession();
    try {
      await ownSession.withTransaction(async () => {
        await executeWithdrawalMutation(ownSession);
      });
      return;
    } catch (error) {
      if (attempt < MAX_TRANSACTION_RETRIES && isTransientTransactionError(error)) {
        continue;
      }
      throw error;
    } finally {
      await ownSession.endSession();
    }
  }
}
