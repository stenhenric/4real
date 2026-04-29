import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../config/env.ts';
import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { OrderProofRelayRepository } from '../repositories/order-proof-relay.repository.ts';
import {
  executeIdempotentMutation,
  executeIdempotentMutationV2,
  IdempotencyConflictError,
} from '../services/idempotency.service.ts';
import { getOrRelayOrderProof } from '../services/order-proof-relay.service.ts';

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

test('BUY proof relay is not duplicated across an idempotent retry after a post-relay failure', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_PROOF_CHANNEL_ID = '-100123';
  resetEnvCacheForTests();

  const idempotencyStore = new Map<string, StoredIdempotencyRecord>();
  const proofStore = new Map<string, { proof: { provider: 'telegram'; url: string; messageId: string; chatId: string } }>();
  const createKey = (userId: string, routeKey: string, idempotencyKey: string) => `${userId}:${routeKey}:${idempotencyKey}`;
  const proofKey = (userId: string, routeKey: string, requestHash: string) => `${userId}:${routeKey}:${requestHash}`;

  const findKeyMock = mock.method(IdempotencyKeyRepository, 'findByKey', async (userId, routeKey, idempotencyKey) =>
    idempotencyStore.get(createKey(userId, routeKey, idempotencyKey)) ?? null,
  );
  const createProcessingMock = mock.method(IdempotencyKeyRepository, 'createProcessing', async (document) => {
    const key = createKey(document.userId, document.routeKey, document.idempotencyKey);
    if (idempotencyStore.has(key)) {
      throw { code: 11000 };
    }

    idempotencyStore.set(key, {
      ...document,
      status: 'processing',
    });
  });
  const markCompletedMock = mock.method(
    IdempotencyKeyRepository,
    'markCompleted',
    async (userId, routeKey, idempotencyKey, responseStatusCode, responseBody) => {
      const key = createKey(userId, routeKey, idempotencyKey);
      const current = idempotencyStore.get(key);
      if (!current) {
        throw new Error('missing idempotency record');
      }

      idempotencyStore.set(key, {
        ...current,
        status: 'completed',
        responseStatusCode,
        responseBody,
      });
    },
  );
  const deleteProcessingMock = mock.method(
    IdempotencyKeyRepository,
    'deleteProcessing',
    async (userId, routeKey, idempotencyKey, requestHash) => {
      const key = createKey(userId, routeKey, idempotencyKey);
      const current = idempotencyStore.get(key);
      if (current?.status === 'processing' && current.requestHash === requestHash) {
        idempotencyStore.delete(key);
      }
    },
  );
  const findProofMock = mock.method(OrderProofRelayRepository, 'findByRequest', async (userId, routeKey, requestHash) =>
    proofStore.get(proofKey(userId, routeKey, requestHash)) ?? null,
  );
  const createProofMock = mock.method(OrderProofRelayRepository, 'create', async (document) => {
    proofStore.set(proofKey(document.userId, document.routeKey, document.requestHash), { proof: document.proof });
  });
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

  t.after(() => findKeyMock.mock.restore());
  t.after(() => createProcessingMock.mock.restore());
  t.after(() => markCompletedMock.mock.restore());
  t.after(() => deleteProcessingMock.mock.restore());
  t.after(() => findProofMock.mock.restore());
  t.after(() => createProofMock.mock.restore());
  t.after(() => fetchMock.mock.restore());

  const requestPayload = {
    type: 'BUY',
    amount: 15,
    transactionCode: 'TX123',
    proofDigest: 'abc123',
  };

  await assert.rejects(
    executeIdempotentMutation({
      userId: 'user-1',
      routeKey: 'orders:create',
      idempotencyKey: 'idem-1',
      requestPayload,
      execute: async ({ requestHash }) => {
        await getOrRelayOrderProof({
          userId: 'user-1',
          routeKey: 'orders:create',
          requestHash,
          relay: createProofRelayParams(),
        });

        throw new Error('order persistence failed');
      },
    }),
    /order persistence failed/,
  );

  const result = await executeIdempotentMutation({
    userId: 'user-1',
    routeKey: 'orders:create',
    idempotencyKey: 'idem-1',
    requestPayload,
    execute: async ({ requestHash }) => {
      const proof = await getOrRelayOrderProof({
        userId: 'user-1',
        routeKey: 'orders:create',
        requestHash,
        relay: createProofRelayParams(),
      });

      return {
        statusCode: 201,
        body: { proofUrl: proof.url },
      };
    },
  });

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(result.replayed, false);
  assert.equal(result.body.proofUrl, 'https://t.me/c/123/1');
  assert.equal(findProofMock.mock.callCount() >= 2, true);
  assert.equal(createProofMock.mock.callCount(), 1);
  assert.equal(findKeyMock.mock.callCount() >= 2, true);
  assert.equal(createProcessingMock.mock.callCount(), 2);
  assert.equal(markCompletedMock.mock.callCount(), 1);
  assert.equal(deleteProcessingMock.mock.callCount(), 1);
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
