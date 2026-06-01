import crypto from 'node:crypto';

import { pollDeposits } from '../workers/deposit-poller.ts';
import { runFailedDepositReplayWorker } from '../workers/failed-deposit-replay-worker.ts';
import { getEnv } from '../config/env.ts';
import { initializeHotWalletRuntime } from './hot-wallet-runtime.service.ts';
import { MatchService } from './match.service.ts';
import { recordBackgroundJobRun } from './metrics.service.ts';
import { runOrderProofRelayWorker } from './order-proof-relay.service.ts';
import { runWithTraceContext } from './trace-context.service.ts';
import {
  confirmSentWithdrawals,
  initWorker,
  monitorHotWalletBalances,
  recoverStuckWithdrawals,
  runWithdrawalWorker as runWithdrawalWorkerTask,
} from '../workers/withdrawal-worker.ts';
import { startBullmqBackgroundJobs, type BullmqBackgroundJobRuntime } from './bullmq-jobs.service.ts';
import {
  createConfiguredTonStreamingClient,
  createTonFinalityWatcher,
  type TonFinalityWatcher,
} from './ton-streaming.service.ts';
import { logger } from '../utils/logger.ts';

export interface JobSnapshot {
  enabled: boolean;
  lastStartedAt?: string;
  lastSucceededAt?: string;
  lastFailedAt?: string;
  lastError?: string;
}

export interface BackgroundJobState {
  depositPoller: JobSnapshot;
  orderProofRelay: JobSnapshot;
  withdrawalWorker: JobSnapshot;
  withdrawalConfirmation: JobSnapshot;
  hotWalletMonitor: JobSnapshot;
  staleMatchExpiry: JobSnapshot;
}

export interface BackgroundJobController {
  getStatus: () => BackgroundJobState;
  stop: () => Promise<void>;
}

const defaultBackgroundJobDependencies = {
  startBullmqBackgroundJobs,
};

const backgroundJobDependencies = {
  ...defaultBackgroundJobDependencies,
};

function createJobRunner(
  name: keyof BackgroundJobState,
  state: BackgroundJobState,
  job: () => Promise<void>,
  options: { rethrowFailures?: boolean } = {},
) {
  let isRunning = false;

  return async () => {
    return runWithTraceContext(
      {
        traceId: crypto.randomUUID(),
        job: name,
      },
      async () => {
        if (isRunning) {
          logger.warn('background_job.skipped_overlap', { job: name });
          recordBackgroundJobRun({ job: name, outcome: 'skipped_overlap', durationMs: 0 });
          return;
        }

        isRunning = true;
        state[name].lastStartedAt = new Date().toISOString();
        const startedAt = performance.now();

        try {
          await job();
          state[name].lastSucceededAt = new Date().toISOString();
          delete state[name].lastError;
          recordBackgroundJobRun({
            job: name,
            outcome: 'success',
            durationMs: performance.now() - startedAt,
          });
        } catch (error) {
          state[name].lastFailedAt = new Date().toISOString();
          state[name].lastError = error instanceof Error ? error.message : String(error);
          logger.error('background_job.failed', { job: name, error });
          recordBackgroundJobRun({
            job: name,
            outcome: 'failure',
            durationMs: performance.now() - startedAt,
          });
          if (options.rethrowFailures === true) {
            throw error;
          }
        } finally {
          isRunning = false;
        }
      },
    );
  };
}

export async function startBackgroundJobs(): Promise<BackgroundJobController> {
  const env = getEnv();
  const useBullmqSchedulers = Boolean(env.FEATURE_BULLMQ_JOBS && env.REDIS_URL);
  const hotWalletRuntime = await initializeHotWalletRuntime();
  const fallbackPollingEnabled = env.TON_API_V3_FALLBACK_ENABLED;
  const depositPollIntervalMs = env.TON_STREAMING_ENABLED
    ? env.TON_STREAMING_FALLBACK_POLL_AFTER_MS
    : 15_000;
  const withdrawalConfirmIntervalMs = env.TON_STREAMING_ENABLED
    ? env.TON_STREAMING_FALLBACK_POLL_AFTER_MS
    : 20_000;

  const state: BackgroundJobState = {
    depositPoller: { enabled: true },
    orderProofRelay: { enabled: true },
    withdrawalWorker: { enabled: true },
    withdrawalConfirmation: { enabled: true },
    hotWalletMonitor: { enabled: true },
    staleMatchExpiry: { enabled: true },
  };

  try {
    await initWorker();
    await recoverStuckWithdrawals();
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    const lastFailedAt = new Date().toISOString();
    state.withdrawalWorker.enabled = false;
    state.withdrawalConfirmation.enabled = false;
    state.hotWalletMonitor.enabled = false;
    state.withdrawalWorker.lastFailedAt = lastFailedAt;
    state.withdrawalConfirmation.lastFailedAt = lastFailedAt;
    state.hotWalletMonitor.lastFailedAt = lastFailedAt;
    state.withdrawalWorker.lastError = lastError;
    state.withdrawalConfirmation.lastError = lastError;
    state.hotWalletMonitor.lastError = lastError;
    logger.error('background_job.initialization_failed', { job: 'withdrawalWorker', error });
  }

  const runnerOptions = { rethrowFailures: useBullmqSchedulers };
  const runDepositPoller = createJobRunner('depositPoller', state, async () => {
    await pollDeposits();
    await runFailedDepositReplayWorker();
  }, runnerOptions);
  const runOrderProofRelay = createJobRunner('orderProofRelay', state, async () => {
    await runOrderProofRelayWorker();
  }, runnerOptions);
  const runWithdrawalWorker = createJobRunner('withdrawalWorker', state, runWithdrawalWorkerTask, runnerOptions);
  const runWithdrawalConfirmation = createJobRunner('withdrawalConfirmation', state, confirmSentWithdrawals, runnerOptions);
  const runHotWalletMonitor = createJobRunner('hotWalletMonitor', state, monitorHotWalletBalances, runnerOptions);
  const runStaleMatchExpiry = createJobRunner('staleMatchExpiry', state, async () => {
    const result = await MatchService.expireStaleMatches();
    if (result.waitingExpired > 0 || result.activeExpired > 0) {
      logger.warn('background_job.stale_matches_settled', result);
    }
  }, runnerOptions);

  let bullmqRuntime: BullmqBackgroundJobRuntime | null = null;
  const bullmqJobs: Parameters<typeof backgroundJobDependencies.startBullmqBackgroundJobs>[0] = [];
  if (useBullmqSchedulers) {
    if (fallbackPollingEnabled) {
      bullmqJobs.push({
        queueName: 'deposit-poll',
        jobName: 'deposit-poll',
        repeatEveryMs: depositPollIntervalMs,
        processor: runDepositPoller,
      });
    }
    bullmqJobs.push(
      {
        queueName: 'order-proof-relay',
        jobName: 'order-proof-relay',
        repeatEveryMs: 15_000,
        processor: runOrderProofRelay,
      },
      {
        queueName: 'withdrawal-send',
        jobName: 'withdrawal-send',
        repeatEveryMs: 5_000,
        processor: runWithdrawalWorker,
      },
    );
    if (fallbackPollingEnabled) {
      bullmqJobs.push(
      {
        queueName: 'withdrawal-confirm',
        jobName: 'withdrawal-confirm',
        repeatEveryMs: withdrawalConfirmIntervalMs,
        processor: runWithdrawalConfirmation,
      },
      );
    }
    bullmqJobs.push(
      {
        queueName: 'hot-wallet-monitor',
        jobName: 'hot-wallet-monitor',
        repeatEveryMs: 60_000,
        processor: runHotWalletMonitor,
      },
      {
        queueName: 'stale-match-expiry',
        jobName: 'stale-match-expiry',
        repeatEveryMs: 30_000,
        processor: runStaleMatchExpiry,
      },
    );
    bullmqRuntime = await backgroundJobDependencies.startBullmqBackgroundJobs(bullmqJobs);
  }

  let tonStreamingWatcher: TonFinalityWatcher | null = null;
  if (env.TON_STREAMING_ENABLED) {
    tonStreamingWatcher = createTonFinalityWatcher({
      addresses: [...new Set([hotWalletRuntime.hotWalletAddress, hotWalletRuntime.hotJettonWallet])],
      client: createConfiguredTonStreamingClient(),
      fallbackEnabled: fallbackPollingEnabled,
      finalityTimeoutMs: env.TON_STREAMING_FINALITY_TIMEOUT_MS,
      onDepositReconcile: async (reason) => {
        logger.info('ton_streaming.deposit_reconcile', { reason });
        await runDepositPoller();
      },
      onWithdrawalReconcile: async (reason) => {
        logger.info('ton_streaming.withdrawal_reconcile', { reason });
        await runWithdrawalConfirmation();
      },
      onFallbackReconcile: async (reason) => {
        logger.warn('ton_streaming.fallback_reconcile', { reason });
        await runDepositPoller();
        await runWithdrawalConfirmation();
      },
      onFeeTelemetry: (telemetry) => {
        logger.info('ton_fee.telemetry', {
          ...telemetry,
          configuredDepositAttachedAmountTon: env.TON_JETTON_TRANSFER_ATTACHED_AMOUNT,
          configuredForwardAmountTon: env.TON_JETTON_FORWARD_AMOUNT,
          configuredWithdrawalExcessBufferTon: env.TON_JETTON_EXCESS_BUFFER,
        });
      },
    });

    try {
      await tonStreamingWatcher.start();
    } catch (error) {
      logger.error('ton_streaming.start_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!fallbackPollingEnabled) {
        throw error;
      }
    }
  }

  const depositHandle = useBullmqSchedulers || !fallbackPollingEnabled
    ? null
    : setInterval(() => {
        void runDepositPoller().catch(() => undefined);
      }, depositPollIntervalMs);
  depositHandle?.unref?.();

  const withdrawalHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runWithdrawalWorker().catch(() => undefined);
      }, 5_000);
  withdrawalHandle?.unref?.();

  const orderProofRelayHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runOrderProofRelay().catch(() => undefined);
      }, 15_000);
  orderProofRelayHandle?.unref?.();

  const confirmationHandle = useBullmqSchedulers || !fallbackPollingEnabled
    ? null
    : setInterval(() => {
        void runWithdrawalConfirmation().catch(() => undefined);
      }, withdrawalConfirmIntervalMs);
  confirmationHandle?.unref?.();

  const monitorHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runHotWalletMonitor().catch(() => undefined);
      }, 60_000);
  monitorHandle?.unref?.();

  const staleMatchHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runStaleMatchExpiry().catch(() => undefined);
      }, 30_000);
  staleMatchHandle?.unref?.();

  return {
    getStatus: () => ({
      depositPoller: { ...state.depositPoller },
      orderProofRelay: { ...state.orderProofRelay },
      withdrawalWorker: { ...state.withdrawalWorker },
      withdrawalConfirmation: { ...state.withdrawalConfirmation },
      hotWalletMonitor: { ...state.hotWalletMonitor },
      staleMatchExpiry: { ...state.staleMatchExpiry },
    }),
    stop: async () => {
      if (depositHandle) {
        clearInterval(depositHandle);
      }
      if (withdrawalHandle) {
        clearInterval(withdrawalHandle);
      }
      if (orderProofRelayHandle) {
        clearInterval(orderProofRelayHandle);
      }
      if (confirmationHandle) {
        clearInterval(confirmationHandle);
      }
      if (monitorHandle) {
        clearInterval(monitorHandle);
      }
      if (staleMatchHandle) {
        clearInterval(staleMatchHandle);
      }
      await tonStreamingWatcher?.stop();
      await bullmqRuntime?.stop();
    },
  };
}

export function setBackgroundJobDependenciesForTests(
  overrides: Partial<typeof defaultBackgroundJobDependencies>,
): void {
  Object.assign(backgroundJobDependencies, overrides);
}

export function resetBackgroundJobDependenciesForTests(): void {
  Object.assign(backgroundJobDependencies, defaultBackgroundJobDependencies);
}
