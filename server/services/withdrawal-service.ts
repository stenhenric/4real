import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

import { getEnv } from '../config/env.ts';
import { ACCOUNTED_WITHDRAWAL_STATUSES, WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
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
  const amountRaw = parseUsdtAmount(amountUsdt).toString();

  const executeWithdrawalMutation = async (activeSession: ClientSession) => {
    const updatedUser = await UserService.deductBalanceSafely(userId, amountUsdt, activeSession);
    if (!updatedUser) {
      recordWithdrawalBalanceHoldFailure('insufficient_balance');
      throw badRequest('Insufficient balance', 'INSUFFICIENT_BALANCE');
    }

    const now = new Date();
    const dayStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ));
    const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const accountedTodayRaw = await WithdrawalRepository.sumAccountedRawBetween(
      userId,
      dayStart,
      nextDayStart,
      ACCOUNTED_WITHDRAWAL_STATUSES,
      'createdAt',
    );
    const dailyLimitRaw = parseUsdtAmount(getEnv().DAILY_WITHDRAWAL_LIMIT_USDT);
    if (accountedTodayRaw + BigInt(amountRaw) > dailyLimitRaw) {
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
