import { pollDeposits } from '../workers/deposit-poller.ts';
import { initializeHotWalletRuntime } from './hot-wallet-runtime.service.ts';
import {
  confirmSentWithdrawals,
  initWorker,
  monitorHotWalletBalances,
  recoverStuckWithdrawals,
  runWithdrawalWorker as runWithdrawalWorkerTask,
} from '../workers/withdrawal-worker.ts';
import { logger } from '../utils/logger.ts';

interface JobSnapshot {
  enabled: boolean;
  lastStartedAt?: string;
  lastSucceededAt?: string;
  lastFailedAt?: string;
  lastError?: string;
}

interface BackgroundJobState {
  depositPoller: JobSnapshot;
  withdrawalWorker: JobSnapshot;
  withdrawalConfirmation: JobSnapshot;
  hotWalletMonitor: JobSnapshot;
}

export interface BackgroundJobController {
  getStatus: () => BackgroundJobState;
  stop: () => void;
}

function createJobRunner(name: keyof BackgroundJobState, state: BackgroundJobState, job: () => Promise<void>) {
  let isRunning = false;

  return async () => {
    if (isRunning) {
      logger.warn('background_job.skipped_overlap', { job: name });
      return;
    }

    isRunning = true;
    state[name].lastStartedAt = new Date().toISOString();

    try {
      await job();
      state[name].lastSucceededAt = new Date().toISOString();
      state[name].lastError = undefined;
    } catch (error) {
      state[name].lastFailedAt = new Date().toISOString();
      state[name].lastError = error instanceof Error ? error.message : String(error);
      logger.error('background_job.failed', { job: name, error });
    } finally {
      isRunning = false;
    }
  };
}

export async function startBackgroundJobs(): Promise<BackgroundJobController> {
  await initializeHotWalletRuntime();

  const state: BackgroundJobState = {
    depositPoller: { enabled: true },
    withdrawalWorker: { enabled: true },
    withdrawalConfirmation: { enabled: true },
    hotWalletMonitor: { enabled: true },
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

  const runDepositPoller = createJobRunner('depositPoller', state, pollDeposits);
  const runWithdrawalWorker = createJobRunner('withdrawalWorker', state, runWithdrawalWorkerTask);
  const runWithdrawalConfirmation = createJobRunner('withdrawalConfirmation', state, confirmSentWithdrawals);
  const runHotWalletMonitor = createJobRunner('hotWalletMonitor', state, monitorHotWalletBalances);

  const depositHandle = setInterval(() => {
    void runDepositPoller();
  }, 15_000);
  depositHandle.unref?.();

  const withdrawalHandle = setInterval(() => {
    void runWithdrawalWorker();
  }, 5_000);
  withdrawalHandle.unref?.();

  const confirmationHandle = setInterval(() => {
    void runWithdrawalConfirmation();
  }, 20_000);
  confirmationHandle.unref?.();

  const monitorHandle = setInterval(() => {
    void runHotWalletMonitor();
  }, 60_000);
  monitorHandle.unref?.();

  return {
    getStatus: () => ({
      depositPoller: { ...state.depositPoller },
      withdrawalWorker: { ...state.withdrawalWorker },
      withdrawalConfirmation: { ...state.withdrawalConfirmation },
      hotWalletMonitor: { ...state.hotWalletMonitor },
    }),
    stop: () => {
      clearInterval(depositHandle);
      clearInterval(withdrawalHandle);
      clearInterval(confirmationHandle);
      clearInterval(monitorHandle);
    },
  };
}
