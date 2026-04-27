import type { TelegramOrderProof } from '../models/Order.ts';
import { OrderProofRelayRepository } from '../repositories/order-proof-relay.repository.ts';
import { relayOrderProofToTelegram } from './telegram-proof.service.ts';

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

export async function getOrRelayOrderProof(params: {
  userId: string;
  routeKey: string;
  requestHash: string;
  relay: Parameters<typeof relayOrderProofToTelegram>[0];
}): Promise<TelegramOrderProof> {
  const existing = await OrderProofRelayRepository.findByRequest(
    params.userId,
    params.routeKey,
    params.requestHash,
  );
  if (existing?.proof) {
    return existing.proof;
  }

  const proof = await relayOrderProofToTelegram(params.relay);
  const now = new Date();

  try {
    await OrderProofRelayRepository.create({
      userId: params.userId,
      routeKey: params.routeKey,
      requestHash: params.requestHash,
      proof,
      createdAt: now,
      updatedAt: now,
    });
    return proof;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const stored = await OrderProofRelayRepository.findByRequest(
      params.userId,
      params.routeKey,
      params.requestHash,
    );
    return stored?.proof ?? proof;
  }
}
