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

function createJobRunner(name: keyof BackgroundJobState, state: BackgroundJobState, job: () => Promise<void>) {
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
  await initializeHotWalletRuntime();

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
    state.withdrawalWorker.enabled = false;
    state.withdrawalConfirmation.enabled = false;
    state.hotWalletMonitor.enabled = false;
    state.withdrawalWorker.lastFailedAt = new Date().toISOString();
    state.withdrawalWorker.lastError = error instanceof Error ? error.message : String(error);
    logger.error('background_job.initialization_failed', { job: 'withdrawalWorker', error });
  }

  const runDepositPoller = createJobRunner('depositPoller', state, async () => {
    await pollDeposits();
    await runFailedDepositReplayWorker();
  });
  const runOrderProofRelay = createJobRunner('orderProofRelay', state, async () => {
    await runOrderProofRelayWorker();
  });
  const runWithdrawalWorker = createJobRunner('withdrawalWorker', state, runWithdrawalWorkerTask);
  const runWithdrawalConfirmation = createJobRunner('withdrawalConfirmation', state, confirmSentWithdrawals);
  const runHotWalletMonitor = createJobRunner('hotWalletMonitor', state, monitorHotWalletBalances);
  const runStaleMatchExpiry = createJobRunner('staleMatchExpiry', state, async () => {
    const result = await MatchService.expireStaleMatches();
    if (result.waitingExpired > 0 || result.activeExpired > 0) {
      logger.warn('background_job.stale_matches_settled', result);
    }
  });

  let bullmqRuntime: BullmqBackgroundJobRuntime | null = null;
  if (useBullmqSchedulers) {
    bullmqRuntime = await backgroundJobDependencies.startBullmqBackgroundJobs([
      {
        queueName: 'deposit-poll',
        jobName: 'deposit-poll',
        repeatEveryMs: 15_000,
        processor: runDepositPoller,
      },
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
      {
        queueName: 'withdrawal-confirm',
        jobName: 'withdrawal-confirm',
        repeatEveryMs: 20_000,
        processor: runWithdrawalConfirmation,
      },
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
    ]);
  }

  const depositHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runDepositPoller();
      }, 15_000);
  depositHandle?.unref?.();

  const withdrawalHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runWithdrawalWorker();
      }, 5_000);
  withdrawalHandle?.unref?.();

  const orderProofRelayHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runOrderProofRelay();
      }, 15_000);
  orderProofRelayHandle?.unref?.();

  const confirmationHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runWithdrawalConfirmation();
      }, 20_000);
  confirmationHandle?.unref?.();

  const monitorHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runHotWalletMonitor();
      }, 60_000);
  monitorHandle?.unref?.();

  const staleMatchHandle = useBullmqSchedulers
    ? null
    : setInterval(() => {
        void runStaleMatchExpiry();
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
