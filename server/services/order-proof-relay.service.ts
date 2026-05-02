import mongoose from 'mongoose';

import { Order } from '../models/Order.ts';
import type { TelegramOrderProof } from '../models/Order.ts';
import {
  OrderProofRelayRepository,
  type OrderProofRelayDocument,
  type OrderProofRelayPayload,
} from '../repositories/order-proof-relay.repository.ts';
import { relayOrderProofToTelegram } from './telegram-proof.service.ts';
import { logger } from '../utils/logger.ts';

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

const MAX_RELAY_ATTEMPTS = 5;

function encodeRelayPayload(
  relay: Parameters<typeof relayOrderProofToTelegram>[0],
): OrderProofRelayPayload {
  return {
    ...relay,
    fileBase64: relay.fileBytes.toString('base64'),
  };
}

function decodeRelayPayload(relay: OrderProofRelayPayload): Parameters<typeof relayOrderProofToTelegram>[0] {
  return {
    orderType: relay.orderType,
    amount: relay.amount,
    fiatCurrency: relay.fiatCurrency,
    exchangeRate: relay.exchangeRate,
    fiatTotal: relay.fiatTotal,
    transactionCode: relay.transactionCode,
    username: relay.username,
    userId: relay.userId,
    mimeType: relay.mimeType,
    filename: relay.filename,
    fileBytes: Buffer.from(relay.fileBase64, 'base64'),
  };
}

function getRelayErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getNextRetryAt(attempts: number): Date {
  const delayMs = Math.min(60_000 * 30, 15_000 * (2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + delayMs);
}

function shouldRetryRelay(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return true;
  }

  const code = String(error.code);
  return code !== 'TELEGRAM_PROOF_RELAY_NOT_CONFIGURED' && code !== 'ORDER_PROOF_ORDER_NOT_FOUND';
}

async function persistProofOnOrder(
  document: OrderProofRelayDocument,
  proof: TelegramOrderProof,
): Promise<TelegramOrderProof> {
  if (!document._id || !document.orderId) {
    throw new Error('Order proof relay document is missing required identifiers');
  }

  const documentId = document._id;
  let settledProof = proof;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(document.orderId, undefined, { session });
      if (!order) {
        const error = new Error('Order not found for proof relay');
        (error as Error & { code?: string }).code = 'ORDER_PROOF_ORDER_NOT_FOUND';
        throw error;
      }

      if (order.proof && order.proof.url) {
        settledProof = order.proof;
      } else {
        order.proof = proof;
        await order.save({ session });
      }

      await OrderProofRelayRepository.markCompleted(documentId, settledProof, session);
    });
  } finally {
    await session.endSession();
  }

  return settledProof;
}

async function processClaimedOrderProofRelay(
  document: OrderProofRelayDocument,
): Promise<TelegramOrderProof | undefined> {
  if (document.proof && document.proof.url) {
    return document.proof;
  }

  if (!document._id || !document.orderId || !document.relay) {
    return undefined;
  }

  try {
    const proof = await relayOrderProofToTelegram(decodeRelayPayload(document.relay));
    return await persistProofOnOrder(document, proof);
  } catch (error) {
    const lastError = getRelayErrorMessage(error);
    const attempts = document.attempts ?? 0;

    if (!shouldRetryRelay(error) || attempts >= MAX_RELAY_ATTEMPTS) {
      await OrderProofRelayRepository.markTerminalFailure(document._id, lastError);
      logger.error('order.proof_relay_terminal_failure', {
        orderId: document.orderId,
        requestHash: document.requestHash,
        attempts,
        error,
      });
      return undefined;
    }

    const nextAttemptAt = getNextRetryAt(attempts);
    await OrderProofRelayRepository.markRetry(document._id, lastError, nextAttemptAt);
    logger.warn('order.proof_relay_retry_scheduled', {
      orderId: document.orderId,
      requestHash: document.requestHash,
      attempts,
      nextAttemptAt: nextAttemptAt.toISOString(),
      error,
    });
    return undefined;
  }
}

export async function enqueueOrderProofRelay(params: {
  userId: string;
  routeKey: string;
  requestHash: string;
  orderId: string;
  relay: Parameters<typeof relayOrderProofToTelegram>[0];
  session?: mongoose.ClientSession;
}): Promise<void> {
  const existing = await OrderProofRelayRepository.findByRequest(
    params.userId,
    params.routeKey,
    params.requestHash,
    params.session,
  );
  if (existing) {
    return;
  }

  const now = new Date();

  try {
    await OrderProofRelayRepository.createPending({
      userId: params.userId,
      routeKey: params.routeKey,
      requestHash: params.requestHash,
      orderId: params.orderId,
      relay: encodeRelayPayload(params.relay),
      createdAt: now,
      updatedAt: now,
    }, params.session);
    return;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }
}

export async function settleOrderProofRelay(params: {
  userId: string;
  routeKey: string;
  requestHash: string;
}): Promise<TelegramOrderProof | undefined> {
  const current = await OrderProofRelayRepository.findByRequest(
    params.userId,
    params.routeKey,
    params.requestHash,
  );
  if (!current) {
    return undefined;
  }

  if (current.proof && current.proof.url) {
    return current.proof;
  }

  const claimed = await OrderProofRelayRepository.claimPendingByRequest(
    params.userId,
    params.routeKey,
    params.requestHash,
  );
  if (!claimed) {
    const latest = await OrderProofRelayRepository.findByRequest(
      params.userId,
      params.routeKey,
      params.requestHash,
    );
    return latest?.proof;
  }

  return processClaimedOrderProofRelay(claimed);
}

export async function runOrderProofRelayWorker(limit = 10): Promise<void> {
  for (let processed = 0; processed < limit; processed += 1) {
    const claimed = await OrderProofRelayRepository.claimNextPending();
    if (!claimed) {
      return;
    }

    await processClaimedOrderProofRelay(claimed);
  }
}
