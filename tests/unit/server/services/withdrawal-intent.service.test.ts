import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { WithdrawalIntentService } from '../../../../server/services/withdrawal-intent.service.ts';
import { setRedisClientForTests } from '../../../../server/services/redis.service.ts';
import { AuthMfaService } from '../../../../server/services/auth-mfa.service.ts';

test('WithdrawalIntentService createIntent, authorizeIntent, and consumeIntent', async (t) => {
  const store = new Map<string, string>();
  const mockRedis = {
    setex: async (key: string, ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    },
    get: async (key: string) => {
      return store.get(key) || null;
    },
    eval: async (_script: string, _keyCount: number, key: string) => {
      const value = store.get(key) || null;
      const exists = store.has(key);
      store.delete(key);
      return exists ? value : null;
    },
  } as any;

  setRedisClientForTests(mockRedis);
  t.after(() => setRedisClientForTests(null));

  // Mock createChallenge in AuthMfaService
  const createChallengeMock = mock.method(AuthMfaService, 'createChallenge', async () => 'challenge-123');
  t.after(() => createChallengeMock.mock.restore());

  // 1. Create intent
  const { withdrawalIntentId, challengeId } = await WithdrawalIntentService.createIntent({
    userId: 'user-1',
    toAddress: 'EQAddress',
    amountUsdt: '10.500000',
    idempotencyKey: 'idemp-1',
  });

  assert.ok(withdrawalIntentId);
  assert.equal(challengeId, 'challenge-123');
  assert.equal(createChallengeMock.mock.callCount(), 1);

  // Check the stored intent
  const rawStored = store.get(`auth:withdrawal:intent:${withdrawalIntentId}`);
  assert.ok(rawStored);
  const storedObj = JSON.parse(rawStored);
  assert.equal(storedObj.userId, 'user-1');
  assert.equal(storedObj.toAddress, 'EQAddress');
  assert.equal(storedObj.amountUsdt, '10.500000');
  assert.equal(storedObj.authorized, false);

  // 2. Authorize intent
  await WithdrawalIntentService.authorizeIntent(withdrawalIntentId);
  const rawStoredAuth = store.get(`auth:withdrawal:intent:${withdrawalIntentId}`);
  assert.ok(rawStoredAuth);
  const storedObjAuth = JSON.parse(rawStoredAuth);
  assert.equal(storedObjAuth.authorized, true);

  // 3. Consume intent (first read deletes it)
  const consumed = await WithdrawalIntentService.consumeIntent(withdrawalIntentId);
  assert.ok(consumed);
  assert.equal(consumed.userId, 'user-1');
  assert.equal(consumed.toAddress, 'EQAddress');
  assert.equal(consumed.amountUsdt, '10.500000');
  assert.equal(consumed.authorized, true);

  // Double-read should return null (prevent replay!)
  const doubleConsumed = await WithdrawalIntentService.consumeIntent(withdrawalIntentId);
  assert.equal(doubleConsumed, null);
  assert.equal(store.has(`auth:withdrawal:intent:${withdrawalIntentId}`), false);
});

test('WithdrawalIntentService atomically consumes only when bound fields match', async (t) => {
  const store = new Map<string, string>();
  const mockRedis = {
    setex: async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    },
    get: async (key: string) => {
      return store.get(key) || null;
    },
    eval: async (_script: string, _keyCount: number, key: string, _mismatchSentinel: string, ...expectedFragments: string[]) => {
      const raw = store.get(key) ?? null;
      if (!raw) {
        return null;
      }

      if (!expectedFragments.every((fragment) => raw.includes(fragment))) {
        return '__WITHDRAWAL_INTENT_MISMATCH__';
      }

      store.delete(key);
      return raw;
    },
  } as any;

  setRedisClientForTests(mockRedis);
  t.after(() => setRedisClientForTests(null));

  const createChallengeMock = mock.method(AuthMfaService, 'createChallenge', async () => 'challenge-atomic');
  t.after(() => createChallengeMock.mock.restore());

  const { withdrawalIntentId } = await WithdrawalIntentService.createIntent({
    userId: 'user-atomic',
    toAddress: 'EQAtomic',
    amountUsdt: '12.000000',
    idempotencyKey: 'idem-atomic',
  });
  await WithdrawalIntentService.authorizeIntent(withdrawalIntentId);

  await assert.rejects(
    WithdrawalIntentService.consumeIntent(withdrawalIntentId, {
      userId: 'user-atomic',
      toAddress: 'EQAtomic',
      amountUsdt: '12.000000',
      idempotencyKey: 'different-idem',
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WITHDRAWAL_INTENT_INVALID');
      return true;
    },
  );

  assert.equal(store.has(`auth:withdrawal:intent:${withdrawalIntentId}`), true);

  const [first, second] = await Promise.all([
    WithdrawalIntentService.consumeIntent(withdrawalIntentId, {
      userId: 'user-atomic',
      toAddress: 'EQAtomic',
      amountUsdt: '12.000000',
      idempotencyKey: 'idem-atomic',
    }),
    WithdrawalIntentService.consumeIntent(withdrawalIntentId, {
      userId: 'user-atomic',
      toAddress: 'EQAtomic',
      amountUsdt: '12.000000',
      idempotencyKey: 'idem-atomic',
    }),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(store.has(`auth:withdrawal:intent:${withdrawalIntentId}`), false);
});
