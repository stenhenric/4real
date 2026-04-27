import { PollerStateRepository } from '../repositories/poller-state.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import {
  fetchIncomingUsdtTransfers,
  ingestIncomingTransfer,
  type JettonTransferEvent,
} from '../services/deposit-ingestion.service.ts';
import { getHotWalletRuntime } from '../services/hot-wallet-runtime.service.ts';
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
  const seenDocs = await ProcessedTransactionRepository.findSeenHashes(txHashes);
  const seenHashes = new Set(seenDocs.map(d => d.txHash));

  const newTransfers = transfers.filter((tx: JettonTransferEvent) => !seenHashes.has(tx.transaction_hash));
  if (newTransfers.length === 0) {
    const latestTime = Math.max(...transfers.map((t: JettonTransferEvent) => t.transaction_now));
    await PollerStateRepository.setLastProcessedTime('deposit_poller', latestTime);
    return;
  }

  for (const tx of newTransfers) {
    await ingestIncomingTransfer(tx);
  }

  const latestTime = Math.max(...transfers.map((t: JettonTransferEvent) => t.transaction_now));
  await PollerStateRepository.setLastProcessedTime('deposit_poller', latestTime);
}
