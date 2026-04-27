import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { resetEnvCacheForTests } from '../config/env.ts';
import { IdempotencyKeyRepository } from '../repositories/idempotency-key.repository.ts';
import { OrderProofRelayRepository } from '../repositories/order-proof-relay.repository.ts';
import { executeIdempotentMutation } from '../services/idempotency.service.ts';
import { getOrRelayOrderProof } from '../services/order-proof-relay.service.ts';

interface StoredIdempotencyRecord {
  userId: string;
  routeKey: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'processing' | 'completed';
  responseStatusCode?: number;
  responseBody?: unknown;
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
