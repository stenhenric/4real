import mongoose from 'mongoose';

import { getEnv } from '../config/env.ts';
import { addressesEqual, extractJettonTransferComment, USDT_MASTER } from '../lib/jetton.ts';
import { getToncenterBaseUrl } from '../lib/ton-client.ts';
import { User } from '../models/User.ts';
import type { DepositMemoDocument } from '../repositories/deposit-memo.repository.ts';
import { DepositMemoRepository } from '../repositories/deposit-memo.repository.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { ProcessedTransactionRepository } from '../repositories/processed-transaction.repository.ts';
import type {
  UnmatchedDepositDocument,
  UnmatchedDepositMemoStatus,
} from '../repositories/unmatched-deposit.repository.ts';
import { UnmatchedDepositRepository } from '../repositories/unmatched-deposit.repository.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { UserService } from './user.service.ts';
import { AuditService } from './audit.service.ts';
import { createDependencyHttpError, runProtectedDependencyCall } from './dependency-resilience.service.ts';
import { getHotWalletRuntime } from './hot-wallet-runtime.service.ts';
import { recordDepositIngestionDecision, registerMetricsCollector, setUnmatchedDepositsOpen } from './metrics.service.ts';
import { parseExternalResponse } from '../schemas/external/parse-external-response.ts';
import { toncenterTransferListSchema } from '../schemas/external/toncenter-transfer.schema.ts';
import { trustFilter } from '../utils/trusted-filter.ts';
import { badRequest, conflict, notFound } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';

const TONCENTER_BASE = getToncenterBaseUrl();

registerMetricsCollector('unmatched_deposits_open', async () => {
  setUnmatchedDepositsOpen(await UnmatchedDepositRepository.countOpen());
});

export interface JettonTransferEvent {
  transaction_hash: string;
  transaction_now: number;
  comment?: string | undefined;
  jetton_master?: string | null | undefined;
  amount: string | number;
  source?: string | null | undefined;
  source_owner?: string | null | undefined;
  source_wallet?: string | null | undefined;
  destination?: string | null | undefined;
  decoded_forward_payload?: { comment?: string | undefined } | Array<{ comment?: string | undefined }> | null | undefined;
  transaction_aborted?: boolean | null | undefined;
  aborted?: boolean | null | undefined;
}

export type DepositReplayDecision =
  | 'credit'
  | 'already_processed'
  | 'already_unmatched_open'
  | 'unmatched'
  | 'rejected';

export interface DepositReplayTransferResult {
  txHash: string;
  decision: DepositReplayDecision;
  amountRaw: string;
  amountUsdt: number;
  comment: string;
  memoStatus: 'missing' | 'inactive' | 'active';
  candidateUserId?: string | null;
  candidateUsername?: string | null;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: string;
  reason?: string;
}

export interface DepositReviewItem {
  txHash: string;
  amountRaw: string;
  amountUsdt: number;
  comment: string;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: string;
  recordedAt: string;
  memoStatus: 'missing' | 'inactive' | 'active';
  candidateUserId?: string | null;
  candidateUsername?: string | null;
  resolutionStatus: 'open' | 'credited' | 'dismissed';
  resolvedAt?: string | undefined;
  resolvedBy?: string | null | undefined;
  resolutionNote?: string | null | undefined;
  resolvedUserId?: string | null | undefined;
}

function toUsdtDisplay(amountRaw: string): string {
  return (Number(amountRaw) / 1e6).toFixed(6);
}

function toUsdtNumber(amountRaw: string): number {
  return Number(toUsdtDisplay(amountRaw));
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

class DepositReviewResolutionRaceError extends Error {
  constructor(txHash: string) {
    super(`Deposit review ${txHash} was already resolved`);
    this.name = 'DepositReviewResolutionRaceError';
  }
}

function getSenderJettonWallet(tx: JettonTransferEvent): string | null {
  if (typeof tx.source_wallet === 'string' && tx.source_wallet.length > 0) {
    return tx.source_wallet;
  }

  if (typeof tx.source === 'string' && tx.source.length > 0 && typeof tx.source_owner === 'string' && tx.source_owner.length > 0) {
    return tx.source;
  }

  if (typeof tx.source === 'string' && tx.source.length > 0 && !tx.source_owner) {
    return tx.source;
  }

  return null;
}

function getSenderOwnerAddress(tx: JettonTransferEvent): string | null {
  if (typeof tx.source_owner === 'string' && tx.source_owner.length > 0) {
    return tx.source_owner;
  }

  if (typeof tx.source === 'string' && tx.source.length > 0) {
    return tx.source;
  }

  return null;
}

function resolveMemoStatus(memoDoc: DepositMemoDocument | undefined, now: Date): {
  status: 'missing' | 'inactive' | 'active';
  candidateUserId?: string | null;
} {
  if (!memoDoc?.userId) {
    return { status: 'missing' };
  }

  if (memoDoc.used === true || memoDoc.expiresAt <= now) {
    return {
      status: 'inactive',
      candidateUserId: memoDoc.userId,
    };
  }

  return {
    status: 'active',
    candidateUserId: memoDoc.userId,
  };
}

async function resolveUsernames(userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniqueUserIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const users = await User.find(trustFilter({ _id: { $in: uniqueUserIds } }))
    .select('username')
    .lean<Array<{ _id: mongoose.Types.ObjectId; username: string }>>();

  return new Map(users.map((user) => [user._id.toString(), user.username]));
}

function mapReviewDocument(
  document: UnmatchedDepositDocument,
  usernameMap: Map<string, string>,
): DepositReviewItem {
  return {
    txHash: document.txHash,
    amountRaw: document.receivedRaw,
    amountUsdt: toUsdtNumber(document.receivedRaw),
    comment: document.comment,
    senderJettonWallet: document.senderJettonWallet,
    senderOwnerAddress: document.senderOwnerAddress,
    txTime: new Date(document.txTime * 1000).toISOString(),
    recordedAt: document.recordedAt.toISOString(),
    memoStatus: document.memoStatus,
    candidateUserId: document.candidateUserId ?? null,
    candidateUsername: document.candidateUserId ? usernameMap.get(document.candidateUserId) ?? null : null,
    resolutionStatus: document.resolved
      ? document.resolutionAction === 'dismissed'
        ? 'dismissed'
        : 'credited'
      : 'open',
    resolvedAt: document.resolvedAt?.toISOString(),
    resolvedBy: document.resolvedBy ?? null,
    resolutionNote: document.resolutionNote ?? null,
    resolvedUserId: document.resolvedUserId ?? null,
  };
}

function withReplayCandidateUsernames(
  transfers: DepositReplayTransferResult[],
  usernameMap: Map<string, string>,
): DepositReplayTransferResult[] {
  return transfers.map((transfer) => ({
    ...transfer,
    candidateUsername: transfer.candidateUserId ? usernameMap.get(transfer.candidateUserId) ?? null : null,
  }));
}

async function resolveAlreadyResolvedReview(params: {
  txHash: string;
  action: 'credit' | 'dismiss';
  userId?: string | undefined;
  note?: string | undefined;
  actorUserId?: string | undefined;
}): Promise<DepositReviewItem> {
  const existing = await UnmatchedDepositRepository.findByTxHash(params.txHash);
  if (!existing) {
    throw new Error('Resolved deposit review item could not be reloaded');
  }

  if (!existing.resolved) {
    throw conflict('Deposit review item changed during reconciliation. Retry the request.', 'DEPOSIT_REVIEW_RESOLUTION_RACE');
  }

  const priorAction = existing.resolutionAction === 'dismissed' ? 'dismiss' : 'credit';
  if (priorAction !== params.action || (params.action === 'credit' && params.userId && existing.resolvedUserId !== params.userId)) {
    throw conflict('Deposit review item was already resolved differently', 'DEPOSIT_REVIEW_ALREADY_RESOLVED');
  }

  return mapReviewDocument(
    existing,
    await resolveUsernames([existing.candidateUserId, existing.resolvedUserId, existing.resolvedBy]),
  );
}

async function createUnmatchedDeposit(params: {
  txHash: string;
  receivedRaw: string;
  comment: string;
  senderJettonWallet: string | null;
  senderOwnerAddress: string | null;
  txTime: number;
  memoStatus: UnmatchedDepositMemoStatus;
  candidateUserId?: string | null;
  session: mongoose.ClientSession;
}): Promise<void> {
  await UnmatchedDepositRepository.create({
    txHash: params.txHash,
    receivedRaw: params.receivedRaw,
    comment: params.comment,
    senderJettonWallet: params.senderJettonWallet,
    senderOwnerAddress: params.senderOwnerAddress,
    txTime: params.txTime,
    recordedAt: new Date(),
    memoStatus: params.memoStatus,
    candidateUserId: params.candidateUserId ?? null,
  }, params.session);

  await ProcessedTransactionRepository.create({
    txHash: params.txHash,
    processedAt: new Date(),
    type: 'deposit_unmatched',
  }, params.session);
}

function buildTransferPreview(
  tx: JettonTransferEvent,
  memoDoc: DepositMemoDocument | undefined,
  options: {
    processed?: boolean;
    unmatchedOpen?: boolean;
  },
): DepositReplayTransferResult {
  const amountRaw = String(tx.amount);
  const comment = extractJettonTransferComment(tx);
  const txTimeIso = new Date(tx.transaction_now * 1000).toISOString();
  const senderJettonWallet = getSenderJettonWallet(tx);
  const senderOwnerAddress = getSenderOwnerAddress(tx);

  if (!tx.jetton_master || !addressesEqual(tx.jetton_master, USDT_MASTER)) {
    return {
      txHash: tx.transaction_hash,
      decision: 'rejected',
      amountRaw,
      amountUsdt: toUsdtNumber(amountRaw),
      comment,
      memoStatus: 'missing',
      senderJettonWallet,
      senderOwnerAddress,
      txTime: txTimeIso,
      reason: 'jetton_master_mismatch',
    };
  }

  if (tx.transaction_aborted === true || tx.aborted === true) {
    return {
      txHash: tx.transaction_hash,
      decision: 'rejected',
      amountRaw,
      amountUsdt: toUsdtNumber(amountRaw),
      comment,
      memoStatus: 'missing',
      senderJettonWallet,
      senderOwnerAddress,
      txTime: txTimeIso,
      reason: 'transaction_aborted',
    };
  }

  const memoResolution = resolveMemoStatus(memoDoc, new Date());

  if (options.processed) {
    return {
      txHash: tx.transaction_hash,
      decision: 'already_processed',
      amountRaw,
      amountUsdt: toUsdtNumber(amountRaw),
      comment,
      memoStatus: memoResolution.status,
      candidateUserId: memoResolution.candidateUserId ?? null,
      senderJettonWallet,
      senderOwnerAddress,
      txTime: txTimeIso,
    };
  }

  if (options.unmatchedOpen) {
    return {
      txHash: tx.transaction_hash,
      decision: 'already_unmatched_open',
      amountRaw,
      amountUsdt: toUsdtNumber(amountRaw),
      comment,
      memoStatus: memoResolution.status,
      candidateUserId: memoResolution.candidateUserId ?? null,
      senderJettonWallet,
      senderOwnerAddress,
      txTime: txTimeIso,
    };
  }

  if (memoResolution.status === 'active') {
    return {
      txHash: tx.transaction_hash,
      decision: 'credit',
      amountRaw,
      amountUsdt: toUsdtNumber(amountRaw),
      comment,
      memoStatus: memoResolution.status,
      candidateUserId: memoResolution.candidateUserId ?? null,
      senderJettonWallet,
      senderOwnerAddress,
      txTime: txTimeIso,
    };
  }

  return {
    txHash: tx.transaction_hash,
    decision: 'unmatched',
    amountRaw,
    amountUsdt: toUsdtNumber(amountRaw),
    comment,
    memoStatus: memoResolution.status,
    candidateUserId: memoResolution.candidateUserId ?? null,
    senderJettonWallet,
    senderOwnerAddress,
    txTime: txTimeIso,
  };
}

function finalizeIngestionResult(result: DepositReplayTransferResult): DepositReplayTransferResult {
  recordDepositIngestionDecision(result.decision);
  return result;
}

export async function fetchIncomingUsdtTransfers(params: {
  ownerAddress: string;
  sinceTime: number;
  untilTime?: number;
}): Promise<JettonTransferEvent[]> {
  let allTransfers: JettonTransferEvent[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const url = new URL(`${TONCENTER_BASE}/api/v3/jetton/transfers`);
    url.searchParams.set('owner_address', params.ownerAddress);
    url.searchParams.set('direction', 'in');
    url.searchParams.set('jetton_master', USDT_MASTER);
    url.searchParams.set('start_utime', String(params.sinceTime));
    if (params.untilTime !== undefined) {
      url.searchParams.set('end_utime', String(params.untilTime));
    }
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort', 'asc');

    try {
      const env = getEnv();
      let res: Response;
      try {
        res = await runProtectedDependencyCall({
          dependency: 'toncenter',
          retries: env.TONCENTER_MAX_RETRIES,
          baseDelayMs: env.TONCENTER_RETRY_BASE_DELAY_MS,
          operation: async () => {
            const nextResponse = await fetch(url.toString(), {
              headers: { 'X-API-Key': env.TONCENTER_API_KEY ?? '' },
              signal: AbortSignal.timeout(env.TONCENTER_REQUEST_TIMEOUT_MS),
            });

            if (!nextResponse.ok) {
              throw createDependencyHttpError('toncenter', nextResponse.status);
            }

            return nextResponse;
          },
        });
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
          if (allTransfers.length === 0) {
            throw new Error('Toncenter rate limited deposit polling before any transfers were fetched');
          }

          logger.warn('deposit_poller.rate_limited_partial');
          break;
        }

        throw error;
      }

      const data = parseExternalResponse(
        toncenterTransferListSchema,
        await res.json(),
        'toncenter.jetton_transfers',
      );
      const transfers = data.jetton_transfers;
      allTransfers = allTransfers.concat(transfers);

      if (transfers.length < limit) {
        break;
      }

      offset += limit;
    } catch (error) {
      if (allTransfers.length === 0) {
        throw error;
      }

      logger.error('deposit_poller.fetch_failed_partial', { error, fetchedTransfers: allTransfers.length });
      break;
    }
  }

  return allTransfers;
}

export async function ingestIncomingTransfer(tx: JettonTransferEvent): Promise<DepositReplayTransferResult> {
  const comment = extractJettonTransferComment(tx);
  const memoDocs = comment ? await DepositMemoRepository.findByMemos([comment]) : [];
  const memoDoc = memoDocs[0];
  const existingProcessed = await ProcessedTransactionRepository.findByHash(tx.transaction_hash);
  const existingUnmatched = await UnmatchedDepositRepository.findByTxHash(tx.transaction_hash);
  const preview = buildTransferPreview(tx, memoDoc, {
    processed: Boolean(existingProcessed),
    unmatchedOpen: Boolean(existingUnmatched && existingUnmatched.resolved !== true),
  });

  if (preview.decision !== 'credit' && preview.decision !== 'unmatched' && preview.decision !== 'rejected') {
    return finalizeIngestionResult(preview);
  }

  if (preview.decision === 'rejected') {
    if (preview.reason !== 'transaction_aborted') {
      return finalizeIngestionResult(preview);
    }

    const rejectionSession = await mongoose.startSession();
    try {
      await rejectionSession.withTransaction(async () => {
        await ProcessedTransactionRepository.create({
          txHash: tx.transaction_hash,
          processedAt: new Date(),
          type: 'deposit_rejected',
        }, rejectionSession);
        
        await AuditService.record({
          eventType: 'deposit_rejected',
          resourceType: 'deposit',
          resourceId: tx.transaction_hash,
          metadata: {
            accepted: false,
            reason: preview.reason,
            senderJettonWallet: preview.senderJettonWallet,
            senderAddress: preview.senderOwnerAddress,
          },
          session: rejectionSession,
        });
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    } finally {
      await rejectionSession.endSession();
    }

    return finalizeIngestionResult(preview);
  }

  const session = await mongoose.startSession();
  let outcome = preview;
  try {
    await session.withTransaction(async () => {
      if (preview.decision === 'unmatched') {
        await createUnmatchedDeposit({
          txHash: tx.transaction_hash,
          receivedRaw: preview.amountRaw,
          comment: preview.comment,
          senderJettonWallet: preview.senderJettonWallet,
          senderOwnerAddress: preview.senderOwnerAddress,
          txTime: tx.transaction_now,
          memoStatus: preview.memoStatus === 'missing' ? 'missing' : 'inactive',
          candidateUserId: preview.candidateUserId ?? null,
          session,
        });
        return;
      }

      const claimedMemo = await DepositMemoRepository.claimActiveMemo(preview.comment, session);
      if (!claimedMemo?.userId) {
        outcome = {
          ...preview,
          decision: 'unmatched',
          memoStatus: 'inactive',
        };
        await createUnmatchedDeposit({
          txHash: tx.transaction_hash,
          receivedRaw: preview.amountRaw,
          comment: preview.comment,
          senderJettonWallet: preview.senderJettonWallet,
          senderOwnerAddress: preview.senderOwnerAddress,
          txTime: tx.transaction_now,
          memoStatus: 'inactive',
          candidateUserId: preview.candidateUserId ?? null,
          session,
        });
        return;
      }

      await ProcessedTransactionRepository.create({
        txHash: tx.transaction_hash,
        processedAt: new Date(),
        type: 'deposit',
      }, session);

      await DepositRepository.create({
        txHash: tx.transaction_hash,
        userId: claimedMemo.userId,
        amountRaw: preview.amountRaw,
        amountDisplay: toUsdtDisplay(preview.amountRaw),
        comment: preview.comment,
        senderJettonWallet: preview.senderJettonWallet ?? '',
        senderAddress: preview.senderOwnerAddress,
        txTime: new Date(tx.transaction_now * 1000),
        status: 'confirmed',
        createdAt: new Date(),
      }, session);

      await UserBalanceRepository.creditDeposit(claimedMemo.userId, preview.amountRaw, session);
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  if (outcome.decision === 'credit') {
    await AuditService.record({
      eventType: 'deposit_credit',
      actorUserId: outcome.candidateUserId ?? null,
      targetUserId: outcome.candidateUserId ?? null,
      resourceType: 'deposit',
      resourceId: tx.transaction_hash,
      metadata: {
        accepted: true,
        amountRaw: outcome.amountRaw,
        amountUsdt: outcome.amountUsdt,
        memo: outcome.comment,
        senderJettonWallet: outcome.senderJettonWallet,
        senderAddress: outcome.senderOwnerAddress,
        txTime: tx.transaction_now,
        destination: tx.destination ?? null,
      },
    });
  }

  return finalizeIngestionResult(outcome);
}

export async function replayDepositWindow(params: {
  sinceUnixTime: number;
  untilUnixTime: number;
  dryRun: boolean;
}): Promise<{
  dryRun: boolean;
  sinceUnixTime: number;
  untilUnixTime: number;
  transfers: DepositReplayTransferResult[];
}> {
  if (!Number.isFinite(params.sinceUnixTime) || !Number.isFinite(params.untilUnixTime)) {
    throw badRequest('Replay window timestamps must be numbers', 'DEPOSIT_REPLAY_WINDOW_INVALID');
  }

  if (params.untilUnixTime < params.sinceUnixTime) {
    throw badRequest('Replay window end must be after the start', 'DEPOSIT_REPLAY_WINDOW_INVALID');
  }

  const { hotWalletAddress } = getHotWalletRuntime();
  const transfers = await fetchIncomingUsdtTransfers({
    ownerAddress: hotWalletAddress,
    sinceTime: Math.floor(params.sinceUnixTime),
    untilTime: Math.floor(params.untilUnixTime),
  });

  if (!params.dryRun) {
    const appliedTransfers: DepositReplayTransferResult[] = [];
    for (const transfer of transfers) {
      appliedTransfers.push(await ingestIncomingTransfer(transfer));
    }

    const usernameMap = await resolveUsernames(appliedTransfers.map((transfer) => transfer.candidateUserId));

    return {
      dryRun: params.dryRun,
      sinceUnixTime: Math.floor(params.sinceUnixTime),
      untilUnixTime: Math.floor(params.untilUnixTime),
      transfers: withReplayCandidateUsernames(appliedTransfers, usernameMap),
    };
  }

  const txHashes = transfers.map((transfer) => transfer.transaction_hash);
  const comments = [
    ...new Set(
      transfers
        .map((transfer) => extractJettonTransferComment(transfer))
        .filter((comment) => comment.length > 0),
    ),
  ];
  const [processedDocs, unmatchedDocs, memoDocs] = await Promise.all([
    ProcessedTransactionRepository.findSeenHashes(txHashes),
    Promise.all(txHashes.map((txHash) => UnmatchedDepositRepository.findByTxHash(txHash))),
    DepositMemoRepository.findByMemos(comments),
  ]);
  const processedHashes = new Set(processedDocs.map((document) => document.txHash));
  const unmatchedOpenHashes = new Set(
    unmatchedDocs
      .filter((document) => Boolean(document && document.resolved !== true))
      .map((document) => document?.txHash)
      .filter((txHash): txHash is string => typeof txHash === 'string'),
  );
  const memoMap = new Map(memoDocs.map((document) => [document.memo, document]));

  const previews = transfers.map((transfer) =>
    buildTransferPreview(transfer, memoMap.get(extractJettonTransferComment(transfer)), {
      processed: processedHashes.has(transfer.transaction_hash),
      unmatchedOpen: unmatchedOpenHashes.has(transfer.transaction_hash),
    }),
  );
  const usernameMap = await resolveUsernames(previews.map((preview) => preview.candidateUserId));

  return {
    dryRun: params.dryRun,
    sinceUnixTime: Math.floor(params.sinceUnixTime),
    untilUnixTime: Math.floor(params.untilUnixTime),
    transfers: withReplayCandidateUsernames(previews, usernameMap),
  };
}

export async function listMerchantDepositReviews(params: {
  status: 'open' | 'resolved';
  limit: number;
}): Promise<DepositReviewItem[]> {
  const documents = await UnmatchedDepositRepository.findByStatus(params.status, params.limit);
  const usernameMap = await resolveUsernames([
    ...documents.map((document) => document.candidateUserId),
    ...documents.map((document) => document.resolvedUserId),
    ...documents.map((document) => document.resolvedBy),
  ]);

  return documents.map((document) => mapReviewDocument(document, usernameMap));
}

export async function reconcileMerchantDeposit(params: {
  txHash: string;
  action: 'credit' | 'dismiss';
  userId?: string | undefined;
  note?: string | undefined;
  actorUserId: string;
}): Promise<DepositReviewItem> {
  const existing = await UnmatchedDepositRepository.findByTxHash(params.txHash);
  if (!existing) {
    throw notFound('Deposit review item not found', 'DEPOSIT_REVIEW_NOT_FOUND');
  }

  if (existing.resolved) {
    return resolveAlreadyResolvedReview(params);
  }

  if (params.action === 'dismiss') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const claimed = await UnmatchedDepositRepository.markResolved({
          txHash: params.txHash,
          resolvedBy: params.actorUserId,
          action: 'dismissed',
          ...(params.note ? { note: params.note } : {}),
        }, session);
        if (!claimed) {
          throw new DepositReviewResolutionRaceError(params.txHash);
        }

        await ProcessedTransactionRepository.updateType(params.txHash, 'deposit_reconciled_dismiss', session);
      });
    } catch (error) {
      if (error instanceof DepositReviewResolutionRaceError) {
        return resolveAlreadyResolvedReview(params);
      }

      throw error;
    } finally {
      await session.endSession();
    }

    await AuditService.record({
      eventType: 'deposit_dismissed',
      actorUserId: params.actorUserId,
      resourceType: 'deposit',
      resourceId: params.txHash,
      metadata: {
        memo: existing.comment,
        note: params.note?.trim() || null,
      },
    });
  } else {
    const targetUserId = params.userId ?? existing.candidateUserId ?? undefined;
    if (!targetUserId) {
      throw badRequest('A userId is required to credit this deposit', 'DEPOSIT_RECONCILE_USER_REQUIRED');
    }

    const user = await UserService.findById(targetUserId);
    if (!user) {
      throw notFound('Target user not found', 'DEPOSIT_RECONCILE_USER_NOT_FOUND');
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const claimed = await UnmatchedDepositRepository.markResolved({
          txHash: params.txHash,
          resolvedBy: params.actorUserId,
          action: 'credited',
          ...(params.note ? { note: params.note } : {}),
          resolvedUserId: targetUserId,
        }, session);
        if (!claimed) {
          throw new DepositReviewResolutionRaceError(params.txHash);
        }

        const existingDeposit = await DepositRepository.findByTxHash(params.txHash, session);
        if (!existingDeposit) {
          await DepositRepository.create({
            txHash: existing.txHash,
            userId: targetUserId,
            amountRaw: existing.receivedRaw,
            amountDisplay: toUsdtDisplay(existing.receivedRaw),
            comment: existing.comment,
            senderJettonWallet: existing.senderJettonWallet ?? '',
            senderAddress: existing.senderOwnerAddress,
            txTime: new Date(existing.txTime * 1000),
            status: 'confirmed',
            createdAt: new Date(),
          }, session);

          await UserBalanceRepository.creditDeposit(targetUserId, existing.receivedRaw, session);
        }

        if (existing.comment && existing.candidateUserId === targetUserId) {
          await DepositMemoRepository.markUsed(existing.comment, session);
        }

        await ProcessedTransactionRepository.updateType(params.txHash, 'deposit_reconciled_credit', session);
      });
    } catch (error) {
      if (error instanceof DepositReviewResolutionRaceError) {
        return resolveAlreadyResolvedReview(params);
      }

      throw error;
    } finally {
      await session.endSession();
    }

    await AuditService.record({
      eventType: 'deposit_reconciled',
      actorUserId: params.actorUserId,
      targetUserId,
      resourceType: 'deposit',
      resourceId: params.txHash,
      metadata: {
        amountRaw: existing.receivedRaw,
        memo: existing.comment,
        note: params.note?.trim() || null,
      },
    });
  }

  const resolved = await UnmatchedDepositRepository.findByTxHash(params.txHash);
  if (!resolved) {
    throw new Error('Resolved deposit review item could not be reloaded');
  }

  const usernameMap = await resolveUsernames([
    resolved.candidateUserId,
    resolved.resolvedUserId,
    resolved.resolvedBy,
  ]);

  return mapReviewDocument(resolved, usernameMap);
}
