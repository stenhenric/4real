import { FailedDepositIngestionRepository } from '../repositories/failed-deposit-ingestion.repository.ts';
import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import {
  buildTransferLookupContext,
  fetchIncomingUsdtTransfers,
  ingestIncomingTransfer,
  type JettonTransferEvent,
} from '../services/deposit-ingestion.service.ts';
import { getHotWalletRuntime } from '../services/hot-wallet-runtime.service.ts';
import { logger } from '../utils/logger.ts';

const INITIAL_DEPOSIT_LOOKBACK_SECONDS = 24 * 60 * 60;

export async function pollDeposits() {
  const { hotWalletAddress } = getHotWalletRuntime();
  const state = await PollerStateRepository.findByKey('deposit_poller');
  const sinceTime = state?.lastProcessedTime ?? Math.floor(Date.now() / 1000) - INITIAL_DEPOSIT_LOOKBACK_SECONDS;

  const transfers = await fetchIncomingUsdtTransfers({
    ownerAddress: hotWalletAddress,
    sinceTime,
  });

  if (transfers.length === 0) return;

  const txHashes = transfers.map((tx: JettonTransferEvent) => tx.transaction_hash);
  const [seenDocs, failedIngestionDocs] = await Promise.all([
    ProcessedTransactionRepository.findSeenHashes(txHashes),
    FailedDepositIngestionRepository.findByTxHashes(txHashes),
  ]);
  const seenHashes = new Set(seenDocs.map(d => d.txHash));
  const failedIngestionMap = new Map(
    failedIngestionDocs.map((document) => [document.txHash, document]),
  );

  const pendingTransfers: JettonTransferEvent[] = [];

  for (const tx of transfers) {
    if (seenHashes.has(tx.transaction_hash)) {
      continue;
    }

    const existingFailure = failedIngestionMap.get(tx.transaction_hash);
    if (existingFailure && existingFailure.status !== 'resolved') {
      continue;
    }

    pendingTransfers.push(tx);
  }

  const transferLookupContext = await buildTransferLookupContext(pendingTransfers);

  for (const tx of pendingTransfers) {

    try {
      await ingestIncomingTransfer(tx, transferLookupContext);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await FailedDepositIngestionRepository.upsertFailure({
        txHash: tx.transaction_hash,
        transferData: tx,
        lastError: errorMessage,
      });
      logger.error('deposit_poller.ingestion_failed', {
        txHash: tx.transaction_hash,
        error: errorMessage,
      });
    }
  }

  const latestTime = Math.max(...transfers.map((t: JettonTransferEvent) => t.transaction_now));
  const earliestPendingFailureTime = await FailedDepositIngestionRepository.findEarliestPendingTransactionTime();
  const nextCursor = earliestPendingFailureTime === null
    ? latestTime
    : Math.min(latestTime, earliestPendingFailureTime);
  await PollerStateRepository.setLastProcessedTime('deposit_poller', nextCursor);
}
