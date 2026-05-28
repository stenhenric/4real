import crypto from 'node:crypto';
import { getRedisClient } from './redis.service.ts';
import { AuthMfaService } from './auth-mfa.service.ts';
import { badRequest } from '../utils/http-error.ts';

const WITHDRAWAL_INTENT_PREFIX = 'auth:withdrawal:intent:';
const WITHDRAWAL_INTENT_TTL_SECONDS = 300; // 5 minutes

export interface WithdrawalIntent {
  userId: string;
  toAddress: string;
  amountUsdt: string;
  idempotencyKey: string;
  challengeId: string;
  authorized: boolean;
  createdAt: number;
}

function getIntentKey(intentId: string): string {
  return `${WITHDRAWAL_INTENT_PREFIX}${intentId}`;
}

export class WithdrawalIntentService {
  static async createIntent(params: {
    userId: string;
    toAddress: string;
    amountUsdt: string;
    idempotencyKey: string;
  }): Promise<{ withdrawalIntentId: string; challengeId: string }> {
    const withdrawalIntentId = crypto.randomUUID();
    
    // Create dedicated withdrawal MFA challenge
    const challengeId = await AuthMfaService.createChallenge({
      userId: params.userId,
      mode: 'withdrawal' as any,
      withdrawalIntentId,
    });

    const intent: WithdrawalIntent = {
      userId: params.userId,
      toAddress: params.toAddress,
      amountUsdt: params.amountUsdt,
      idempotencyKey: params.idempotencyKey,
      challengeId,
      authorized: false,
      createdAt: Date.now(),
    };

    await getRedisClient().setex(
      getIntentKey(withdrawalIntentId),
      WITHDRAWAL_INTENT_TTL_SECONDS,
      JSON.stringify(intent),
    );

    return { withdrawalIntentId, challengeId };
  }

  static async authorizeIntent(intentId: string): Promise<void> {
    const key = getIntentKey(intentId);
    const rawIntent = await getRedisClient().get(key);
    if (!rawIntent) {
      throw badRequest('Withdrawal intent expired or invalid', 'WITHDRAWAL_INTENT_EXPIRED');
    }

    const intent = JSON.parse(rawIntent) as WithdrawalIntent;
    intent.authorized = true;

    // Save authorized intent in Redis
    await getRedisClient().setex(
      key,
      WITHDRAWAL_INTENT_TTL_SECONDS,
      JSON.stringify(intent),
    );
  }

  static async consumeIntent(intentId: string): Promise<WithdrawalIntent | null> {
    const key = getIntentKey(intentId);
    const rawIntent = await getRedisClient().get(key);
    if (!rawIntent) {
      return null;
    }

    // Delete immediately on read to prevent replay attacks!
    await getRedisClient().del(key);

    try {
      return JSON.parse(rawIntent) as WithdrawalIntent;
    } catch {
      return null;
    }
  }
}
