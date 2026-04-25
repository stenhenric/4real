import mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { getHotWalletRuntime } from '../services/hot-wallet-runtime.service.ts';
import {
  findWithdrawalTransferOnChain,
  getHotWalletTonBalance,
  getHotWalletUsdtBalanceRaw,
  sendUsdtWithdrawal,
  SeqnoTimeoutError,
} from '../services/withdrawal-engine.ts';
import { UserService } from '../services/user.service.ts';
import { logger } from '../utils/logger.ts';

let isSending = false;
let isConfirming = false;
let isMonitoring = false;
let hotJettonWallet: string | null = null;

const defaultWorkerDependencies = {
  sendUsdtWithdrawal,
  findWithdrawalTransferOnChain,
  getHotWalletTonBalance,
  getHotWalletUsdtBalanceRaw,
};

const workerDependencies = {
  ...defaultWorkerDependencies,
};

function formatUsdtRaw(raw: bigint): string {
  const negative = raw < 0n ? '-' : '';
  const absolute = raw < 0n ? -raw : raw;
  const whole = absolute / 1_000_000n;
  const fractional = (absolute % 1_000_000n).toString().padStart(6, '0');
  return `${negative}${whole}.${fractional}`;
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

export async function initWorker() {
  const runtime = getHotWalletRuntime();
  hotJettonWallet = runtime.hotJettonWallet;
  logger.info('withdrawal_worker.initialized', {
    hotJettonWallet,
    hotWalletAddress: runtime.hotWalletAddress,
  });
}

export async function runWithdrawalWorker() {
  if (!hotJettonWallet) return;
  if (isSending) return;
  isSending = true;

  try {
    const doc = await WithdrawalRepository.claimNextQueued(3);

    if (!doc) return;

    try {
      const seqno = await workerDependencies.sendUsdtWithdrawal({
        toAddress: doc.toAddress,
        amountRaw: doc.amountRaw,
        withdrawalId: doc.withdrawalId,
        hotJettonWallet,
      });

      await WithdrawalRepository.markSent(doc._id, seqno);

      logger.info('withdrawal.sent', { withdrawalId: doc.withdrawalId, seqno });

    } catch (sendErr: unknown) {
      const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
      logger.error('withdrawal.failed', { withdrawalId: doc.withdrawalId, errorMessage });

      if (sendErr instanceof SeqnoTimeoutError) {
        await WithdrawalRepository.markStuck(doc._id, errorMessage, sendErr.seqno, sendErr.sentAt);
      } else {
        const retries = (doc.retries ?? 0) + 1;
        const newStatus = retries >= 3 ? 'failed' : 'queued';
        const session = await mongoose.startSession();

        try {
          await session.withTransaction(async () => {
            await WithdrawalRepository.markRetryState(doc._id, newStatus, errorMessage, session);

            if (newStatus === 'failed') {
              await UserBalanceRepository.refundWithdrawal(doc.userId, doc.amountRaw, session);
              await UserService.syncUserDisplayBalance(doc.userId, session);
            }
          });
        } finally {
          await session.endSession();
        }

        if (newStatus === 'failed') {
          logger.warn('withdrawal.refunded', { withdrawalId: doc.withdrawalId });
        }
      }
    }

  } finally {
    isSending = false;
  }
}

export async function confirmSentWithdrawals() {
  if (!hotJettonWallet) return;
  if (isConfirming) return;
  isConfirming = true;

  try {
    const pending = await WithdrawalRepository.findPendingConfirmation(25);
    const thirtyMinsAgo = Date.now() - 30 * 60_000;

    for (const withdrawal of pending) {
      if (!withdrawal.sentAt) {
        continue;
      }

      const confirmed = await workerDependencies.findWithdrawalTransferOnChain({
        hotJettonWallet,
        sentAt: withdrawal.sentAt,
        withdrawalId: withdrawal.withdrawalId,
        amountRaw: withdrawal.amountRaw,
        toAddress: withdrawal.toAddress,
      });

      const session = await mongoose.startSession();

      if (confirmed) {
        try {
          await session.withTransaction(async () => {
            await ProcessedTransactionRepository.create({
              txHash: confirmed.txHash,
              processedAt: new Date(),
              type: 'withdrawal_confirm',
            }, session);

            await WithdrawalRepository.markConfirmed(
              withdrawal._id,
              confirmed.txHash,
              confirmed.confirmedAt,
              session,
            );

            await UserBalanceRepository.recordWithdrawalConfirmed(
              withdrawal.userId,
              withdrawal.amountRaw,
              session,
            );
          });

          logger.info('withdrawal.confirmed', {
            withdrawalId: withdrawal.withdrawalId,
            txHash: confirmed.txHash,
            confirmedAt: confirmed.confirmedAt.toISOString(),
          });
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
        } finally {
          await session.endSession();
        }
      } else if (withdrawal.sentAt.getTime() < thirtyMinsAgo) {
         try {
            await session.withTransaction(async () => {
              await WithdrawalRepository.markRetryState(
                withdrawal._id,
                'failed',
                'Expired waiting for confirmation on-chain',
                session
              );

              await UserBalanceRepository.refundWithdrawal(
                withdrawal.userId,
                withdrawal.amountRaw,
                session
              );
              await UserService.syncUserDisplayBalance(withdrawal.userId, session);
            });
            logger.warn('withdrawal.expired_unconfirmed_refunded', { withdrawalId: withdrawal.withdrawalId });
         } catch (err) {
             logger.error('withdrawal.expire_error', { withdrawalId: withdrawal.withdrawalId, err });
         } finally {
           await session.endSession();
         }
      }
    }
  } finally {
    isConfirming = false;
  }
}

export async function monitorHotWalletBalances() {
  if (isMonitoring) return;
  isMonitoring = true;

  try {
    const env = getEnv();
    const runtime = getHotWalletRuntime();
    const tonBalanceRaw = await workerDependencies.getHotWalletTonBalance(runtime.hotWalletAddress);
    const onChainUsdtRaw = await workerDependencies.getHotWalletUsdtBalanceRaw(runtime.hotWalletAddress);
    const ledgerUsdtRaw = await UserBalanceRepository.sumBalanceRaw();
    const tonBalance = Number(tonBalanceRaw) / 1_000_000_000;
    const minimumUsdtBalanceRaw = BigInt(Math.round(env.HOT_WALLET_MIN_USDT_BALANCE * 1_000_000));
    const mismatchToleranceRaw = BigInt(Math.round(env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT * 1_000_000));

    logger.info('wallet_monitor.snapshot', {
      tonBalance,
      onChainUsdt: onChainUsdtRaw === null ? null : formatUsdtRaw(onChainUsdtRaw),
      ledgerUsdt: formatUsdtRaw(ledgerUsdtRaw),
      deltaUsdt: onChainUsdtRaw === null
        ? null
        : formatUsdtRaw(onChainUsdtRaw >= ledgerUsdtRaw ? onChainUsdtRaw - ledgerUsdtRaw : ledgerUsdtRaw - onChainUsdtRaw),
    });

    if (tonBalance < env.HOT_WALLET_MIN_TON_BALANCE) {
      logger.warn('wallet_monitor.low_ton_balance', {
        tonBalance,
        minimumTonBalance: env.HOT_WALLET_MIN_TON_BALANCE,
      });
    }

    if (onChainUsdtRaw === null) {
      return;
    }

    if (onChainUsdtRaw < minimumUsdtBalanceRaw) {
      logger.warn('wallet_monitor.low_usdt_balance', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        minimumUsdtBalance: env.HOT_WALLET_MIN_USDT_BALANCE,
      });
    }

    const deltaUsdtRaw = onChainUsdtRaw >= ledgerUsdtRaw
      ? onChainUsdtRaw - ledgerUsdtRaw
      : ledgerUsdtRaw - onChainUsdtRaw;

    if (onChainUsdtRaw < ledgerUsdtRaw) {
      logger.error('wallet_monitor.ledger_shortfall', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        ledgerUsdt: formatUsdtRaw(ledgerUsdtRaw),
        deltaUsdt: formatUsdtRaw(ledgerUsdtRaw - onChainUsdtRaw),
      });
    } else if (deltaUsdtRaw > mismatchToleranceRaw) {
      logger.warn('wallet_monitor.ledger_mismatch', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        ledgerUsdt: formatUsdtRaw(ledgerUsdtRaw),
        deltaUsdt: formatUsdtRaw(deltaUsdtRaw),
        toleranceUsdt: env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT,
      });
    }
  } finally {
    isMonitoring = false;
  }
}

export async function recoverStuckWithdrawals() {
  if (!hotJettonWallet) return;
  const tenMinsAgo = new Date(Date.now() - 10 * 60_000);
  const stuck = await WithdrawalRepository.findStaleProcessing(tenMinsAgo);

  if (stuck.length > 0) {
    const idsToRequeue: mongoose.Types.ObjectId[] = [];

    for (const withdrawal of stuck) {
      if (!withdrawal.startedAt) continue;

      try {
        const confirmed = await workerDependencies.findWithdrawalTransferOnChain({
          hotJettonWallet,
          sentAt: withdrawal.startedAt,
          withdrawalId: withdrawal.withdrawalId,
          amountRaw: withdrawal.amountRaw,
          toAddress: withdrawal.toAddress,
        });

        if (confirmed) {
          logger.info('withdrawal.stuck_found_on_chain', {
            withdrawalId: withdrawal.withdrawalId,
            txHash: confirmed.txHash,
          });

          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await ProcessedTransactionRepository.create({
                txHash: confirmed.txHash,
                processedAt: new Date(),
                type: 'withdrawal_confirm',
              }, session);

              await WithdrawalRepository.markConfirmed(
                withdrawal._id,
                confirmed.txHash,
                confirmed.confirmedAt,
                session,
              );

              await UserBalanceRepository.recordWithdrawalConfirmed(
                withdrawal.userId,
                withdrawal.amountRaw,
                session,
              );
            });
          } catch (error) {
            if (!isDuplicateKeyError(error)) {
               logger.error('withdrawal.stuck_recover_error', { withdrawalId: withdrawal.withdrawalId, error });
            }
          } finally {
            await session.endSession();
          }
        } else {
          idsToRequeue.push(withdrawal._id as mongoose.Types.ObjectId);
        }
      } catch (err) {
        logger.error('withdrawal.stuck_check_error', { withdrawalId: withdrawal.withdrawalId, err });
        // Assume not sent and requeue, but ideally we'd retry checking
        idsToRequeue.push(withdrawal._id as mongoose.Types.ObjectId);
      }
    }

    if (idsToRequeue.length > 0) {
      logger.warn('withdrawal.reset_stuck', { count: idsToRequeue.length });
      await WithdrawalRepository.requeueByIds(idsToRequeue);
    }
  }
}

export function resetWithdrawalWorkerStateForTests(): void {
  isSending = false;
  isConfirming = false;
  isMonitoring = false;
  hotJettonWallet = null;
  Object.assign(workerDependencies, defaultWorkerDependencies);
}

export function setWithdrawalWorkerDependenciesForTests(overrides: Partial<typeof defaultWorkerDependencies>): void {
  Object.assign(workerDependencies, overrides);
}
