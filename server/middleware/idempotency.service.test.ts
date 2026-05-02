import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { Order } from '../models/Order.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { OrderProofRelayRepository } from '../repositories/order-proof-relay.repository.ts';
import {
  executeIdempotentMutationV2,
  IdempotencyConflictError,
} from '../services/idempotency.service.ts';
import { enqueueOrderProofRelay, settleOrderProofRelay } from '../services/order-proof-relay.service.ts';

interface StoredIdempotencyRecord {
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'processing' | 'completed';
  responseStatusCode?: number;
  responseBody?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

function createProofRelayParams() {
  return {
    orderType: 'BUY' as const,
    amount: 15,
    fiatCurrency: 'KES' as const,
    exchangeRate: 140,
    fiatTotal: 2100,
    transactionCode: 'TX123',
    username: 'buyer',
    userId: 'user-1',
    mimeType: 'image/png',
    filename: 'proof.png',
    fileBytes: Buffer.from('proof'),
  };
}

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

test('settleOrderProofRelay relays once and reuses the stored proof on subsequent retries', async (t) => {
  const originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_PROOF_CHANNEL_ID: process.env.TELEGRAM_PROOF_CHANNEL_ID,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DATABASE: process.env.MONGODB_DATABASE,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTests();
  });

  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_PROOF_CHANNEL_ID = '-100123';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/4real';
  process.env.MONGODB_DATABASE = '4real';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
  process.env.MONGODB_DATABASE = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/4real';
  process.env.MONGODB_DATABASE = '4real';
  resetEnvCacheForTests();

  const proofStore = new Map<string, {
    _id: string;
    userId: string;
    routeKey: string;
    requestHash: string;
    orderId: string;
    relay?: ReturnType<typeof createProofRelayParams> & { fileBase64: string };
    proof?: { provider: 'telegram'; url: string; messageId: string; chatId: string };
    status?: 'pending' | 'processing' | 'completed' | 'terminal_failure';
    attempts?: number;
  }>();
  const proofKey = (userId: string, routeKey: string, requestHash: string) => `${userId}:${routeKey}:${requestHash}`;
  const sessionMock = createSessionMock();
  const startSessionMock = mock.method(mongoose, 'startSession', async () => sessionMock as any);
  const findProofMock = mock.method(OrderProofRelayRepository, 'findByRequest', async (userId, routeKey, requestHash) =>
    proofStore.get(proofKey(userId, routeKey, requestHash)) ?? null,
  );
  const createProofMock = mock.method(OrderProofRelayRepository, 'createPending', async (document) => {
    proofStore.set(proofKey(document.userId, document.routeKey, document.requestHash), {
      _id: 'proof-1',
      ...document,
      status: 'pending',
      attempts: 0,
    });
  });
  const claimProofMock = mock.method(OrderProofRelayRepository, 'claimPendingByRequest', async (userId, routeKey, requestHash) => {
    const key = proofKey(userId, routeKey, requestHash);
    const current = proofStore.get(key);
    if (!current || current.status !== 'pending') {
      return null;
    }

    const claimed = {
      ...current,
      status: 'processing' as const,
      attempts: (current.attempts ?? 0) + 1,
    };
    proofStore.set(key, claimed);
    return claimed as any;
  });
  const markCompletedMock = mock.method(OrderProofRelayRepository, 'markCompleted', async (id, proof) => {
    for (const [key, value] of proofStore.entries()) {
      if (value._id !== id) {
        continue;
      }

      proofStore.set(key, {
        ...value,
        status: 'completed',
        proof,
        relay: undefined,
      });
    }
  });
  const markRetryMock = mock.method(OrderProofRelayRepository, 'markRetry', async () => {});
  const markTerminalFailureMock = mock.method(OrderProofRelayRepository, 'markTerminalFailure', async () => {});
  let orderProof: { provider: 'telegram'; url: string; messageId: string; chatId: string } | undefined;
  const orderDocument = {
    proof: undefined as typeof orderProof,
    async save() {
      orderProof = this.proof;
      return this;
    },
  };
  const findOrderMock = mock.method(Order, 'findById', async () => orderDocument as any);
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        result: {
          message_id: 1,
          chat: {
            id: '-100123',
          },
        },
      };
    },
  }) as Response);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => findProofMock.mock.restore());
  t.after(() => createProofMock.mock.restore());
  t.after(() => claimProofMock.mock.restore());
  t.after(() => markCompletedMock.mock.restore());
  t.after(() => markRetryMock.mock.restore());
  t.after(() => markTerminalFailureMock.mock.restore());
  t.after(() => findOrderMock.mock.restore());
  t.after(() => fetchMock.mock.restore());

  await enqueueOrderProofRelay({
    userId: 'user-1',
    routeKey: 'orders:create',
    requestHash: 'hash-1',
    orderId: 'order-1',
    relay: createProofRelayParams(),
  });

  const first = await settleOrderProofRelay({
    userId: 'user-1',
    routeKey: 'orders:create',
    requestHash: 'hash-1',
  });
  const second = await settleOrderProofRelay({
    userId: 'user-1',
    routeKey: 'orders:create',
    requestHash: 'hash-1',
  });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(createProofMock.mock.callCount(), 1);
  assert.equal(claimProofMock.mock.callCount(), 1);
  assert.equal(markCompletedMock.mock.callCount(), 1);
  assert.equal(markRetryMock.mock.callCount(), 0);
  assert.equal(markTerminalFailureMock.mock.callCount(), 0);
  assert.deepEqual(first, {
    provider: 'telegram',
    url: 'https://t.me/c/123/1',
    messageId: '1',
    chatId: '-100123',
  });
  assert.deepEqual(second, first);
  assert.deepEqual(orderProof, first);
});

test('executeIdempotentMutationV2 commits once and replays subsequent retries', async (t) => {
  const idempotencyStore = new Map<string, StoredIdempotencyRecord>();
  const key = (userId: string, routeKey: string, idempotencyKey: string) => `${userId}:${routeKey}:${idempotencyKey}`;
  const sessionMock = {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };

  const startSessionMock = mock.method(mongoose, 'startSession', async () => sessionMock as any);
  const claimMock = mock.method(IdempotencyKeyRepository, 'claimOrGetExisting', async (document) => {
    const scopedKey = key(document.userId, document.routeKey, document.idempotencyKey);
    const existing = idempotencyStore.get(scopedKey);
    if (existing) {
      return existing as any;
    }

    idempotencyStore.set(scopedKey, {
      ...document,
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return null;
  });
  const markCompletedMock = mock.method(
    IdempotencyKeyRepository,
    'markCompletedIfProcessing',
    async (document, responseStatusCode, responseBody) => {
      const scopedKey = key(document.userId, document.routeKey, document.idempotencyKey);
      const current = idempotencyStore.get(scopedKey);
      if (!current || current.status !== 'processing' || current.requestHash !== document.requestHash) {
        return false;
      }

      idempotencyStore.set(scopedKey, {
        ...current,
        status: 'completed',
        responseStatusCode,
        responseBody,
        updatedAt: new Date(),
      });
      return true;
    },
  );
  const findByKeyMock = mock.method(
    IdempotencyKeyRepository,
    'findByKey',
    async (userId, routeKey, idempotencyKey) => idempotencyStore.get(key(userId, routeKey, idempotencyKey)) as any,
  );

  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMock.mock.restore());
  t.after(() => markCompletedMock.mock.restore());
  t.after(() => findByKeyMock.mock.restore());

  let mutationRuns = 0;
  const first = await executeIdempotentMutationV2({
    userId: 'user-v2',
    routeKey: 'orders:create',
    idempotencyKey: 'idem-v2-1',
    requestPayload: { amount: 15 },
    execute: async () => {
      mutationRuns += 1;
      return {
        statusCode: 201,
        body: { orderId: 'ord-1' },
      };
    },
  });

  const replay = await executeIdempotentMutationV2({
    userId: 'user-v2',
    routeKey: 'orders:create',
    idempotencyKey: 'idem-v2-1',
    requestPayload: { amount: 15 },
    execute: async () => {
      throw new Error('should not execute for replay');
    },
  });

  assert.equal(first.replayed, false);
  assert.equal(first.statusCode, 201);
  assert.deepEqual(first.body, { orderId: 'ord-1' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.statusCode, 201);
  assert.deepEqual(replay.body, { orderId: 'ord-1' });
  assert.equal(mutationRuns, 1);
  assert.equal(markCompletedMock.mock.callCount(), 1);
});

test('executeIdempotentMutationV2 rejects concurrent processing requests with IdempotencyConflictError', async (t) => {
  const sessionMock = {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };

  const startSessionMock = mock.method(mongoose, 'startSession', async () => sessionMock as any);
  const claimMock = mock.method(IdempotencyKeyRepository, 'claimOrGetExisting', async (document) => ({
    userId: document.userId,
    routeKey: document.routeKey,
    idempotencyKey: document.idempotencyKey,
    requestHash: document.requestHash,
    status: 'processing',
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as any);
  const findByKeyMock = mock.method(IdempotencyKeyRepository, 'findByKey', async () => null);
  const markCompletedMock = mock.method(IdempotencyKeyRepository, 'markCompletedIfProcessing', async () => true);

  t.after(() => startSessionMock.mock.restore());
  t.after(() => claimMock.mock.restore());
  t.after(() => findByKeyMock.mock.restore());
  t.after(() => markCompletedMock.mock.restore());

  let mutationRuns = 0;
  await assert.rejects(
    executeIdempotentMutationV2({
      userId: 'user-v2',
      routeKey: 'matches:join:room-1',
      idempotencyKey: 'idem-v2-2',
      requestPayload: { roomId: 'room-1' },
      execute: async () => {
        mutationRuns += 1;
        return {
          statusCode: 200,
          body: { ok: true },
        };
      },
    }),
    (error: unknown) => {
      assert.equal(error instanceof IdempotencyConflictError, true);
      return true;
    },
  );

  assert.equal(mutationRuns, 0);
  assert.equal(markCompletedMock.mock.callCount(), 0);
});
