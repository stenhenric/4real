import mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import { AuditService } from '../services/audit.service.ts';
import { getHotWalletRuntime } from '../services/hot-wallet-runtime.service.ts';
import {
  recordWithdrawalConfirmation,
  setWalletReserveDeltaUsdt,
  setWalletTonBalance,
  setWalletUsdtBalance,
} from '../services/metrics.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { LockUnavailableError, withLock } from '../services/distributed-lock.service.ts';
import {
  findWithdrawalTransferOnChain,
  getHotWalletTonBalance,
  getHotWalletUsdtBalanceRaw,
  sendUsdtWithdrawal,
  SeqnoTimeoutError,
} from '../services/withdrawal-engine.ts';
import { UserService } from '../services/user.service.ts';
import { logger } from '../utils/logger.ts';

let isConfirming = false;
let isMonitoring = false;
let hotWalletAddress: string | null = null;
let hotJettonWallet: string | null = null;

const defaultWorkerDependencies = {
  sendUsdtWithdrawal,
  findWithdrawalTransferOnChain,
  getHotWalletTonBalance,
  getHotWalletUsdtBalanceRaw,
  withLock,
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

async function refundFailedWithdrawal({
  id,
  withdrawalId,
  userId,
  amountRaw,
  amountDisplay,
  errorMessage,
}: {
  id: mongoose.Types.ObjectId | string;
  withdrawalId: string;
  userId: string;
  amountRaw: string;
  amountDisplay: string;
  errorMessage: string;
}): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await WithdrawalRepository.markRetryState(id, 'failed', errorMessage, session);
      await UserBalanceRepository.refundWithdrawal(userId, amountRaw, session);
      await TransactionService.createTransaction({
        userId,
        type: 'WITHDRAW_REFUND',
        amount: amountDisplay,
        referenceId: withdrawalId,
        session,
      });
    });
  } finally {
    await session.endSession();
  }
}

export async function initWorker() {
  const runtime = getHotWalletRuntime();
  hotWalletAddress = runtime.hotWalletAddress;
  hotJettonWallet = runtime.hotJettonWallet;
  logger.info('withdrawal_worker.initialized', {
    hotJettonWallet,
    hotWalletAddress: runtime.hotWalletAddress,
  });
}

export async function runWithdrawalWorker() {
  const currentHotJettonWallet = hotJettonWallet;
  const currentHotWalletAddress = hotWalletAddress;
  if (!currentHotJettonWallet) return;
  if (!currentHotWalletAddress) return;
  const env = getEnv();
  const sendLockResource = `wallet-send:${currentHotWalletAddress}`;
  const sendTask = async () => {
    const doc = await WithdrawalRepository.claimNextQueued(3);

    if (!doc) return;

    let submittedWithdrawal: Awaited<ReturnType<typeof workerDependencies.sendUsdtWithdrawal>> | null = null;

    try {
      submittedWithdrawal = await workerDependencies.sendUsdtWithdrawal({
        toAddress: doc.toAddress,
        amountRaw: doc.amountRaw,
        withdrawalId: doc.withdrawalId,
        hotJettonWallet: currentHotJettonWallet,
      });

      try {
        await WithdrawalRepository.markSent(doc._id, submittedWithdrawal.seqno, submittedWithdrawal.sentAt);
        await AuditService.record({
          eventType: 'withdrawal_sent',
          actorUserId: doc.userId,
          targetUserId: doc.userId,
          resourceType: 'withdrawal',
          resourceId: doc.withdrawalId,
          metadata: {
            seqno: submittedWithdrawal.seqno,
            amountRaw: doc.amountRaw,
            toAddress: doc.toAddress,
          },
        });

        logger.info('withdrawal.sent', {
          withdrawalId: doc.withdrawalId,
          seqno: submittedWithdrawal.seqno,
        });
      } catch (postSendError: unknown) {
        const errorMessage = postSendError instanceof Error ? postSendError.message : String(postSendError);
        logger.error('withdrawal.post_send_persist_failed', {
          withdrawalId: doc.withdrawalId,
          errorMessage,
          seqno: submittedWithdrawal.seqno,
        });

        try {
          await WithdrawalRepository.markStuck(
            doc._id,
            errorMessage,
            submittedWithdrawal.seqno,
            submittedWithdrawal.sentAt,
          );
        } catch (markStuckError) {
          logger.error('withdrawal.post_send_stuck_mark_failed', {
            withdrawalId: doc.withdrawalId,
            errorMessage: markStuckError instanceof Error ? markStuckError.message : String(markStuckError),
            seqno: submittedWithdrawal.seqno,
          });
        }
      }
    } catch (sendErr: unknown) {
      const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
      logger.error('withdrawal.failed', { withdrawalId: doc.withdrawalId, errorMessage });

      if (sendErr instanceof SeqnoTimeoutError) {
        await WithdrawalRepository.markStuck(doc._id, errorMessage, sendErr.seqno, sendErr.sentAt);
      } else {
        const retries = (doc.retries ?? 0) + 1;
        const newStatus = retries >= 3 ? 'failed' : 'queued';
        if (newStatus === 'failed') {
          await refundFailedWithdrawal({
            id: doc._id,
            withdrawalId: doc.withdrawalId,
            userId: doc.userId,
            amountRaw: doc.amountRaw,
            amountDisplay: doc.amountDisplay,
            errorMessage,
          });
        } else {
          const session = await mongoose.startSession();

          try {
            await session.withTransaction(async () => {
              await WithdrawalRepository.markRetryState(doc._id, newStatus, errorMessage, session);
            });
          } finally {
            await session.endSession();
          }
        }

        if (newStatus === 'failed') {
          logger.warn('withdrawal.refunded', { withdrawalId: doc.withdrawalId });
        }
      }
    }
  };

  try {
    if (!env.FEATURE_DISTRIBUTED_LOCK) {
      await sendTask();
      return;
    }

    await workerDependencies.withLock(sendLockResource, 30_000, sendTask);
  } catch (error) {
    if (error instanceof LockUnavailableError) {
      logger.info('withdrawal.send_lock_unavailable', {
        resource: sendLockResource,
      });
      return;
    }

    throw error;
  }
}

export async function confirmSentWithdrawals() {
  if (!hotWalletAddress) return;
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
        hotWalletAddress,
        sentAt: withdrawal.sentAt,
        withdrawalId: withdrawal.withdrawalId,
        amountRaw: withdrawal.amountRaw,
        toAddress: withdrawal.toAddress,
      });

      if (confirmed) {
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
          await AuditService.record({
            eventType: 'withdrawal_confirmed',
            actorUserId: withdrawal.userId,
            targetUserId: withdrawal.userId,
            resourceType: 'withdrawal',
            resourceId: withdrawal.withdrawalId,
            metadata: {
              txHash: confirmed.txHash,
              confirmedAt: confirmed.confirmedAt.toISOString(),
            },
          });

          logger.info('withdrawal.confirmed', {
            withdrawalId: withdrawal.withdrawalId,
            txHash: confirmed.txHash,
            confirmedAt: confirmed.confirmedAt.toISOString(),
          });
          recordWithdrawalConfirmation('confirmed');
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
        } finally {
          await session.endSession();
        }
      } else if (withdrawal.sentAt.getTime() < thirtyMinsAgo) {
        try {
          await WithdrawalRepository.markStuck(
            withdrawal._id,
            'Expired waiting for confirmation on-chain',
            withdrawal.seqno,
            withdrawal.sentAt,
          );
          logger.warn('withdrawal.confirmation_delayed', {
            withdrawalId: withdrawal.withdrawalId,
          });
          recordWithdrawalConfirmation('stuck');
        } catch (err) {
          logger.error('withdrawal.expire_error', { withdrawalId: withdrawal.withdrawalId, err });
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
    const ledgerUsdtRaw = await UserBalanceRepository.sumBalanceRawForLedger({
      excludeUserIds: [SYSTEM_COMMISSION_ACCOUNT_ID],
    });
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

    const failures: string[] = [];
    setWalletTonBalance(tonBalance);

    if (tonBalance < env.HOT_WALLET_MIN_TON_BALANCE) {
      logger.warn('wallet_monitor.low_ton_balance', {
        tonBalance,
        minimumTonBalance: env.HOT_WALLET_MIN_TON_BALANCE,
      });
      failures.push(
        `TON balance ${tonBalance.toFixed(2)} below minimum ${env.HOT_WALLET_MIN_TON_BALANCE.toFixed(2)}`,
      );
    }

    if (onChainUsdtRaw === null) {
      return;
    }

    setWalletUsdtBalance(Number(formatUsdtRaw(onChainUsdtRaw)));

    if (onChainUsdtRaw < minimumUsdtBalanceRaw) {
      logger.warn('wallet_monitor.low_usdt_balance', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        minimumUsdtBalance: env.HOT_WALLET_MIN_USDT_BALANCE,
      });
      failures.push(
        `USDT reserve ${formatUsdtRaw(onChainUsdtRaw)} below minimum ${env.HOT_WALLET_MIN_USDT_BALANCE.toFixed(2)}`,
      );
    }

    const deltaUsdtRaw = onChainUsdtRaw >= ledgerUsdtRaw
      ? onChainUsdtRaw - ledgerUsdtRaw
      : ledgerUsdtRaw - onChainUsdtRaw;
    setWalletReserveDeltaUsdt(
      Number(formatUsdtRaw(onChainUsdtRaw)) - Number(formatUsdtRaw(ledgerUsdtRaw)),
    );

    if (onChainUsdtRaw < ledgerUsdtRaw) {
      logger.error('wallet_monitor.ledger_shortfall', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        ledgerUsdt: formatUsdtRaw(ledgerUsdtRaw),
        deltaUsdt: formatUsdtRaw(ledgerUsdtRaw - onChainUsdtRaw),
      });
      failures.push(`Customer liability shortfall ${formatUsdtRaw(ledgerUsdtRaw - onChainUsdtRaw)}`);
    } else if (deltaUsdtRaw > mismatchToleranceRaw) {
      logger.warn('wallet_monitor.ledger_mismatch', {
        onChainUsdt: formatUsdtRaw(onChainUsdtRaw),
        ledgerUsdt: formatUsdtRaw(ledgerUsdtRaw),
        deltaUsdt: formatUsdtRaw(deltaUsdtRaw),
        toleranceUsdt: env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT,
      });
      failures.push(
        `Reserve/ledger mismatch ${formatUsdtRaw(deltaUsdtRaw)} exceeds tolerance ${env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT.toFixed(2)}`,
      );
    }

    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }
  } finally {
    isMonitoring = false;
  }
}

export async function recoverStuckWithdrawals() {
  if (!hotWalletAddress) return;
  const tenMinsAgo = new Date(Date.now() - 10 * 60_000);
  const stuck = await WithdrawalRepository.findStaleProcessing(tenMinsAgo);

  if (stuck.length > 0) {
    for (const withdrawal of stuck) {
      if (!withdrawal.startedAt) continue;

      try {
        const confirmed = await workerDependencies.findWithdrawalTransferOnChain({
          hotWalletAddress,
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
            await AuditService.record({
              eventType: 'withdrawal_confirmed',
              actorUserId: withdrawal.userId,
              targetUserId: withdrawal.userId,
              resourceType: 'withdrawal',
              resourceId: withdrawal.withdrawalId,
              metadata: {
                txHash: confirmed.txHash,
                confirmedAt: confirmed.confirmedAt.toISOString(),
                recovered: true,
              },
            });
            recordWithdrawalConfirmation('recovered_confirmed');
          } catch (error) {
            if (!isDuplicateKeyError(error)) {
               logger.error('withdrawal.stuck_recover_error', { withdrawalId: withdrawal.withdrawalId, error });
            }
          } finally {
            await session.endSession();
          }
        } else {
          await WithdrawalRepository.markStuck(
            withdrawal._id,
            'Processing state expired before a definitive on-chain outcome was recorded',
            withdrawal.seqno,
            withdrawal.startedAt,
          );
          logger.warn('withdrawal.processing_stuck', { withdrawalId: withdrawal.withdrawalId });
          recordWithdrawalConfirmation('processing_stuck');
        }
      } catch (err) {
        logger.error('withdrawal.stuck_check_error', { withdrawalId: withdrawal.withdrawalId, err });
        await WithdrawalRepository.markStuck(
          withdrawal._id,
          'On-chain reconciliation check failed for a stale processing withdrawal',
          withdrawal.seqno,
          withdrawal.startedAt,
        );
        recordWithdrawalConfirmation('processing_reconcile_failed');
      }
    }
  }
}

export function resetWithdrawalWorkerStateForTests(): void {
  isConfirming = false;
  isMonitoring = false;
  hotWalletAddress = null;
  hotJettonWallet = null;
  Object.assign(workerDependencies, defaultWorkerDependencies);
}

export function setWithdrawalWorkerDependenciesForTests(overrides: Partial<typeof defaultWorkerDependencies>): void {
  Object.assign(workerDependencies, overrides);
}
