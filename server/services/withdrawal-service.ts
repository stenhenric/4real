import mongoose from 'mongoose';

import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { UserService } from './user.service.ts';

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
}: {
  userId: string;
  toAddress: string;
  amountUsdt: number;
  withdrawalId: string;
}) {
  const amountRaw = BigInt(Math.round(amountUsdt * 1_000_000)).toString();

  for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const balanceDoc = await UserBalanceRepository.findByUserId(userId, session);
        const currentRaw = BigInt(balanceDoc?.balanceRaw ?? '0');
        const requestedRaw = BigInt(amountRaw);
        if (currentRaw < requestedRaw) {
          throw new Error('Insufficient balance');
        }
        const nextRaw = (currentRaw - requestedRaw).toString();
        await UserBalanceRepository.setBalanceRaw(userId, nextRaw, session);
        await WithdrawalRepository.createQueued({
          withdrawalId,
          userId,
          toAddress,
          amountRaw,
          amountDisplay: amountUsdt.toFixed(6),
        }, session);

        await UserService.syncUserDisplayBalance(userId, session);
      });
      return;
    } catch (error) {
      if (attempt < MAX_TRANSACTION_RETRIES && isTransientTransactionError(error)) {
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
