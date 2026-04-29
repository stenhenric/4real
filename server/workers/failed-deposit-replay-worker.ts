import { getEnv } from '../config/env.ts';
import { FailedDepositIngestionRepository } from '../repositories/failed-deposit-ingestion.repository.ts';
import { ingestIncomingTransfer } from '../services/deposit-ingestion.service.ts';
import { logger } from '../utils/logger.ts';

const MAX_BACKOFF_MS = 5 * 60_000;
const REPLAY_BATCH_SIZE = 50;

const defaultReplayWorkerDependencies = {
  ingestIncomingTransfer,
};

const replayWorkerDependencies = {
  ...defaultReplayWorkerDependencies,
};

function getBackoffMs(retryCount: number): number {
  return Math.min((2 ** retryCount) * 1_000, MAX_BACKOFF_MS);
}

export async function runFailedDepositReplayWorker(): Promise<void> {
  const env = getEnv();
  const maxRetries = env.DEPOSIT_INGESTION_MAX_RETRIES;
  const now = new Date();
  const retryableFailures = await FailedDepositIngestionRepository.findRetryable(now, maxRetries, REPLAY_BATCH_SIZE);

  for (const failedIngestion of retryableFailures) {
    try {
      await replayWorkerDependencies.ingestIncomingTransfer(failedIngestion.transferData);
      await FailedDepositIngestionRepository.markResolved(failedIngestion.txHash);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const nextRetryCount = failedIngestion.retryCount + 1;

      if (nextRetryCount >= maxRetries) {
        await FailedDepositIngestionRepository.markTerminalFailure({
          txHash: failedIngestion.txHash,
          retryCount: nextRetryCount,
          lastError: errorMessage,
        });
        logger.error('deposit_replay.terminal_failure', {
          alert: 'deposit_unrecoverable',
          txHash: failedIngestion.txHash,
          retryCount: nextRetryCount,
          error: errorMessage,
        });
        continue;
      }

      const nextRetryAt = new Date(Date.now() + getBackoffMs(failedIngestion.retryCount));
      await FailedDepositIngestionRepository.markRetryScheduled({
        txHash: failedIngestion.txHash,
        retryCount: nextRetryCount,
        lastError: errorMessage,
        nextRetryAt,
      });
    }
  }
}

export function resetFailedDepositReplayWorkerForTests(): void {
  Object.assign(replayWorkerDependencies, defaultReplayWorkerDependencies);
}

export function setFailedDepositReplayWorkerDependenciesForTests(
  overrides: Partial<typeof defaultReplayWorkerDependencies>,
): void {
  Object.assign(replayWorkerDependencies, overrides);
}
