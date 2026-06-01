import crypto from 'node:crypto';
import { getRedisClient } from './redis.service.ts';
import { AuthMfaService } from './auth-mfa.service.ts';
import { badRequest, forbidden } from '../utils/http-error.ts';

const WITHDRAWAL_INTENT_PREFIX = 'auth:withdrawal:intent:';
const WITHDRAWAL_INTENT_TTL_SECONDS = 300; // 5 minutes
const WITHDRAWAL_INTENT_MISMATCH = '__WITHDRAWAL_INTENT_MISMATCH__';
const ATOMIC_COMPARE_DELETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return nil
end
for index = 2, #ARGV do
  if string.find(raw, ARGV[index], 1, true) == nil then
    return ARGV[1]
  end
end
redis.call('DEL', KEYS[1])
return raw
`;

export interface WithdrawalIntent {
  userId: string;
  toAddress: string;
  amountUsdt: string;
  idempotencyKey: string;
  challengeId: string;
  authorized: boolean;
  createdAt: number;
}

export interface WithdrawalIntentConsumeExpectation {
  userId: string;
  toAddress: string;
  amountUsdt: string;
  idempotencyKey: string;
}

function getIntentKey(intentId: string): string {
  return `${WITHDRAWAL_INTENT_PREFIX}${intentId}`;
}

function jsonFragment(key: keyof WithdrawalIntent, value: string | boolean): string {
  return `${JSON.stringify(key)}:${JSON.stringify(value)}`;
}

async function atomicConsumeRawIntent(
  key: string,
  expected?: WithdrawalIntentConsumeExpectation,
): Promise<string | null> {
  const redis = getRedisClient() as any;

  if (expected && typeof redis.eval === 'function') {
    const result = await redis.eval(
      ATOMIC_COMPARE_DELETE_SCRIPT,
      1,
      key,
      WITHDRAWAL_INTENT_MISMATCH,
      jsonFragment('userId', expected.userId),
      jsonFragment('toAddress', expected.toAddress),
      jsonFragment('amountUsdt', expected.amountUsdt),
      jsonFragment('idempotencyKey', expected.idempotencyKey),
      jsonFragment('authorized', true),
    );

    if (result === WITHDRAWAL_INTENT_MISMATCH) {
      throw forbidden('Withdrawal intent invalid or not authorized', 'WITHDRAWAL_INTENT_INVALID');
    }

    return typeof result === 'string' ? result : null;
  }

  if (typeof redis.getdel === 'function') {
    const result = await redis.getdel(key);
    return typeof result === 'string' ? result : null;
  }

  if (typeof redis.eval === 'function') {
    const result = await redis.eval(
      "local raw = redis.call('GET', KEYS[1]); if raw then redis.call('DEL', KEYS[1]); end; return raw",
      1,
      key,
    );
    return typeof result === 'string' ? result : null;
  }

  throw new Error('Redis client does not support atomic withdrawal intent consumption');
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

  static async consumeIntent(
    intentId: string,
    expected?: WithdrawalIntentConsumeExpectation,
  ): Promise<WithdrawalIntent | null> {
    const key = getIntentKey(intentId);
    const rawIntent = await atomicConsumeRawIntent(key, expected);
    if (!rawIntent) {
      return null;
    }

    try {
      return JSON.parse(rawIntent) as WithdrawalIntent;
    } catch {
      return null;
    }
  }
}
