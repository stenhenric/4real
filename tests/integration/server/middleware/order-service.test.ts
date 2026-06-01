import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { OrderController } from '../../../../server/controllers/order.controller.ts';
import { Order } from '../../../../server/models/Order.ts';
import { AuditService } from '../../../../server/services/audit.service.ts';
import { OrderService } from '../../../../server/services/order.service.ts';
import { ProductEmailNotificationService } from '../../../../server/services/product-email-notification.service.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';
import {
  resetMpesaCodeValidationForTests,
  setMpesaCodeAttemptDependenciesForTests,
} from '../../../../server/services/mpesa-code-validation.service.ts';
import { OrderProofRelayRepository } from '../../../../server/repositories/order-proof-relay.repository.ts';

function createSessionMock() {
  return {
    async withTransaction(work: () => Promise<void>) {
      await work();
    },
    async endSession() {},
  };
}

function registerSessionCleanup(t: TestContext) {
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  t.after(() => startSessionMock.mock.restore());
}

function createResponseMock() {
  return {
    locals: {
      requestId: 'req-1',
    },
    statusCode: undefined as number | undefined,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
  };
}

function createProofImage() {
  return {
    fieldName: 'proofImage',
    filename: 'proof.png',
    contentType: 'image/png',
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    size: 9,
  };
}

async function setupBuyOrderControllerTest(t: TestContext, transactionCode: string) {
  resetMpesaCodeValidationForTests();
  setMpesaCodeAttemptDependenciesForTests({
    now: () => new Date('2026-05-27T09:00:00.000Z'),
  });
  t.after(() => {
    resetMpesaCodeValidationForTests();
  });

  const multipart = await import('../../../../server/utils/multipart.ts');
  multipart.setMultipartParserForTests(async () => ({
    fields: {
      type: 'BUY',
      amount: '5.000000',
      transactionCode,
    },
    files: {
      proofImage: createProofImage(),
    },
  }));
  t.after(() => {
    multipart.resetMultipartParserForTests();
  });

  const merchantConfig = await import('../../../../server/services/merchant-config.service.ts');
  merchantConfig.setMerchantConfigForTests({
    mpesaNumber: '254700000000',
    walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    instructions: 'Use exact amount.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '140.000000',
    sellRateKesPerUsdt: '135.000000',
  });
  t.after(() => {
    merchantConfig.resetMerchantConfigForTests();
  });

  const idempotency = await import('../../../../server/services/idempotency.service.ts');
  idempotency.setIdempotencyV2ExecutorForTests(async (params: any) => {
    const executed = await params.execute({
      requestHash: 'hash-123',
      session: createSessionMock(),
    });

    return {
      ...executed,
      replayed: false,
      requestHash: 'hash-123',
    };
  });
  t.after(() => {
    idempotency.resetIdempotencyV2ExecutorForTests();
  });

  const cache = await import('../../../../server/services/cache.service.ts');
  cache.setInvalidateCacheKeysForTests(async () => {});
  t.after(() => {
    cache.setInvalidateCacheKeysForTests(null);
  });
}

test('getOrders always scopes results to the requesting user', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  let capturedFilter: Record<string, unknown> | undefined;
  const findMock = mock.method(Order, 'find', (filter: Record<string, unknown>) => {
    capturedFilter = filter;
    return {
      sort() {
        return this;
      },
      populate() {
        return this;
      },
      select() {
        return Promise.resolve([]);
      },
    } as any;
  });

  t.after(() => findMock.mock.restore());

  const orders = await OrderService.getOrders(userId.toString());

  assert.deepEqual(orders, []);
  assert(capturedFilter);
  assert.equal((capturedFilter.userId as mongoose.Types.ObjectId).toString(), userId.toString());
  assert.equal(Object.keys(capturedFilter).length, 1);
});

test('createOrder reserves SELL balances and creates the pending ledger entry in one transaction', async (t) => {
  registerSessionCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const deductMock = mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: userId } as any));
  let createdOrderInput: Record<string, unknown> | undefined;
  const createOrderMock = mock.method(Order, 'create', async (documents) => {
    createdOrderInput = documents[0] as Record<string, unknown>;
    return [{
    _id: orderId,
    userId,
    type: 'SELL',
    amount: '12.000000',
    status: 'PENDING',
    proof: {
      provider: 'telegram',
      url: 'https://t.me/c/123/10',
      messageId: '10',
      chatId: '-100123',
    },
    transactionCode: 'QWE123ABC',
    fiatCurrency: 'KES',
    exchangeRate: '140.00',
    fiatTotal: '1680.00',
    mpesaNumber: '254700111222',
    mpesaName: 'Alice Seller',
    createdAt: new Date(),
  }] as any;
  });
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-1' } as any));

  t.after(() => deductMock.mock.restore());
  t.after(() => createOrderMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());

  const order = await OrderService.createOrder({
    userId,
    type: 'SELL',
    amount: '12.000000',
    proof: {
      provider: 'telegram',
      url: 'https://t.me/c/123/10',
      messageId: '10',
      chatId: '-100123',
    },
    transactionCode: 'QWE123ABC',
    mpesaNumber: '254700111222',
    mpesaName: 'Alice Seller',
    fiatCurrency: 'KES',
    exchangeRate: '140.00',
    fiatTotal: '1680.00',
  });

  assert.equal(order._id.toString(), orderId.toString());
  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(deductMock.mock.calls[0].arguments[0], userId.toString());
  assert.equal(createOrderMock.mock.callCount(), 1);
  assert.equal(createdOrderInput?.mpesaNumber, '254700111222');
  assert.equal(createdOrderInput?.mpesaName, 'Alice Seller');
  assert.equal(createTransactionMock.mock.callCount(), 1);
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { status: string }).status, 'PENDING');
});

test('updateOrderStatus refunds rejected SELL orders and updates the ledger status atomically', async (t) => {
  registerSessionCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  let savedWithSession = false;
  const orderDocument = {
    _id: orderId,
    userId,
    type: 'SELL',
    amount: '7.000000',
    status: 'PENDING',
    async save(options?: { session?: unknown }) {
      savedWithSession = Boolean(options?.session);
      return this;
    },
  };
  const findByIdMock = mock.method(Order, 'findById', async () => orderDocument as any);
  const updateBalanceMock = mock.method(UserService, 'updateBalance', async () => ({ _id: userId } as any));
  const updateTransactionMock = mock.method(TransactionService, 'updateTransactionStatusByReference', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'refund-tx' } as any));
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => findByIdMock.mock.restore());
  t.after(() => updateBalanceMock.mock.restore());
  t.after(() => updateTransactionMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  const updated = await OrderService.updateOrderStatus(orderId.toString(), 'REJECTED');

  assert.equal(updated?._id.toString(), orderId.toString());
  assert.equal((updated as any)?.statusTransitionApplied, true);
  assert.equal(orderDocument.status, 'REJECTED');
  assert.equal(savedWithSession, true);
  assert.equal(updateBalanceMock.mock.callCount(), 1);
  assert.equal(updateBalanceMock.mock.calls[0].arguments[0], userId.toString());
  assert.equal(updateTransactionMock.mock.callCount(), 1);
  assert.equal(updateTransactionMock.mock.calls[0].arguments[1], 'REJECTED');
  assert.equal(createTransactionMock.mock.callCount(), 1);
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { type: string }).type, 'SELL_P2P_REFUND');
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { amount: string }).amount, '7.000000');
});

test('updateOrderStatus returns an unapplied signal when the requested status is unchanged', async (t) => {
  registerSessionCleanup(t);

  const orderId = new mongoose.Types.ObjectId();
  const orderDocument = {
    _id: orderId,
    userId: new mongoose.Types.ObjectId(),
    type: 'BUY',
    amount: 5,
    status: 'DONE',
    async save() {
      return this;
    },
  };
  const findByIdMock = mock.method(Order, 'findById', async () => orderDocument as any);
  const updateBalanceMock = mock.method(UserService, 'updateBalance', async () => null);
  const updateTransactionMock = mock.method(TransactionService, 'updateTransactionStatusByReference', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => findByIdMock.mock.restore());
  t.after(() => updateBalanceMock.mock.restore());
  t.after(() => updateTransactionMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  const updated = await OrderService.updateOrderStatus(orderId.toString(), 'DONE');

  assert.equal(updated?._id.toString(), orderId.toString());
  assert.equal((updated as any)?.statusTransitionApplied, false);
  assert.equal(updateBalanceMock.mock.callCount(), 0);
  assert.equal(updateTransactionMock.mock.callCount(), 0);
  assert.equal(auditMock.mock.callCount(), 0);
});

test('updateOrderStatus rejects transitions away from final states', async (t) => {
  registerSessionCleanup(t);

  const orderId = new mongoose.Types.ObjectId();
  const orderDocument = {
    _id: orderId,
    userId: new mongoose.Types.ObjectId(),
    type: 'BUY',
    amount: 5,
    status: 'DONE',
    async save() {
      return this;
    },
  };
  const findByIdMock = mock.method(Order, 'findById', async () => orderDocument as any);
  const updateBalanceMock = mock.method(UserService, 'updateBalance', async () => null);
  const updateTransactionMock = mock.method(TransactionService, 'updateTransactionStatusByReference', async () => {});
  const auditMock = mock.method(AuditService, 'record', async () => {});

  t.after(() => findByIdMock.mock.restore());
  t.after(() => updateBalanceMock.mock.restore());
  t.after(() => updateTransactionMock.mock.restore());
  t.after(() => auditMock.mock.restore());

  await assert.rejects(
    OrderService.updateOrderStatus(orderId.toString(), 'REJECTED'),
    /Order status is final/,
  );

  assert.equal(updateBalanceMock.mock.callCount(), 0);
  assert.equal(updateTransactionMock.mock.callCount(), 0);
});

test('updateOrder sends user notification when order is approved', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    userId,
    type: 'BUY',
    amount: '5.000000',
    status: 'DONE',
    transactionCode: 'ABC123XYZ',
    fiatCurrency: 'KES',
    exchangeRate: '140.000000',
    fiatTotal: '700.00',
    createdAt: new Date(),
  };
  const updateOrderStatusMock = mock.method(OrderService, 'updateOrderStatus', async () => ({
    ...order,
    statusTransitionApplied: true,
  }) as any);
  const sendOrderFinalizedMock = mock.method(ProductEmailNotificationService, 'sendOrderFinalized', async () => {});

  t.after(() => updateOrderStatusMock.mock.restore());
  t.after(() => sendOrderFinalizedMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: true },
    params: { id: orderId.toString() },
    body: { status: 'DONE' },
  };
  const res = createResponseMock();

  await OrderController.updateOrder(req as any, res as any);

  assert.equal(updateOrderStatusMock.mock.callCount(), 1);
  assert.equal(sendOrderFinalizedMock.mock.callCount(), 1);
  assert.deepEqual(sendOrderFinalizedMock.mock.calls[0].arguments[0], {
    userId: userId.toString(),
    orderId: orderId.toString(),
    orderType: 'BUY',
    amountUsdt: '5.000000',
    status: 'DONE',
    fiatCurrency: 'KES',
    fiatTotal: '700.00',
    exchangeRate: '140.000000',
    transactionCode: 'ABC123XYZ',
  });
  assert.equal((res.jsonBody as { status: string }).status, 'DONE');
});

test('updateOrder does not send a duplicate final notification when final status is unchanged', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    userId,
    type: 'BUY',
    amount: '5.000000',
    status: 'DONE',
    transactionCode: 'ABC123XYZ',
    fiatCurrency: 'KES',
    exchangeRate: '140.000000',
    fiatTotal: '700.00',
    createdAt: new Date(),
    statusTransitionApplied: false,
  };
  const updateOrderStatusMock = mock.method(OrderService, 'updateOrderStatus', async () => order as any);
  const sendOrderFinalizedMock = mock.method(ProductEmailNotificationService, 'sendOrderFinalized', async () => {});

  t.after(() => updateOrderStatusMock.mock.restore());
  t.after(() => sendOrderFinalizedMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: true },
    params: { id: orderId.toString() },
    body: { status: 'DONE' },
  };
  const res = createResponseMock();

  await OrderController.updateOrder(req as any, res as any);

  assert.equal(updateOrderStatusMock.mock.callCount(), 1);
  assert.equal(sendOrderFinalizedMock.mock.callCount(), 0);
  assert.equal((res.jsonBody as { status: string }).status, 'DONE');
});

test('updateOrder sends user notification when order is rejected', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    userId,
    type: 'SELL',
    amount: '2.500000',
    status: 'REJECTED',
    transactionCode: 'REJ123XYZ',
    fiatCurrency: 'KES',
    exchangeRate: '139.000000',
    fiatTotal: '347.50',
    createdAt: new Date(),
  };
  const updateOrderStatusMock = mock.method(OrderService, 'updateOrderStatus', async () => ({
    ...order,
    statusTransitionApplied: true,
  }) as any);
  const sendOrderFinalizedMock = mock.method(ProductEmailNotificationService, 'sendOrderFinalized', async () => {});

  t.after(() => updateOrderStatusMock.mock.restore());
  t.after(() => sendOrderFinalizedMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: true },
    params: { id: orderId.toString() },
    body: { status: 'REJECTED' },
  };
  const res = createResponseMock();

  await OrderController.updateOrder(req as any, res as any);

  assert.equal(sendOrderFinalizedMock.mock.callCount(), 1);
  assert.deepEqual(sendOrderFinalizedMock.mock.calls[0].arguments[0], {
    userId: userId.toString(),
    orderId: orderId.toString(),
    orderType: 'SELL',
    amountUsdt: '2.500000',
    status: 'REJECTED',
    fiatCurrency: 'KES',
    fiatTotal: '347.50',
    exchangeRate: '139.000000',
    transactionCode: 'REJ123XYZ',
  });
  assert.equal((res.jsonBody as { status: string }).status, 'REJECTED');
});

test('createOrder completes immediately and does not await/block on ProductEmailNotificationService.sendOrderCreated', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();

  // Mock dependencies
  t.mock.method(UserService, 'findById', async () => ({
    _id: userId,
    email: 'bob@example.com',
    username: 'bob',
  }));

  // We mock multipart form parsing
  const multipart = await import('../../../../server/utils/multipart.ts');
  multipart.setMultipartParserForTests(async () => ({
    fields: {
      type: 'SELL',
      amount: '5.000000',
      mpesaNumber: '254700111222',
      mpesaName: 'Bob Seller',
    },
    files: {},
  }));
  t.after(() => {
    multipart.resetMultipartParserForTests();
  });

  const merchantConfig = await import('../../../../server/services/merchant-config.service.ts');
  merchantConfig.setMerchantConfigForTests({
    mpesaNumber: '254700000000',
    walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    instructions: 'Use exact amount.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '140.000000',
    sellRateKesPerUsdt: '135.000000',
  });
  t.after(() => {
    merchantConfig.resetMerchantConfigForTests();
  });

  const idempotency = await import('../../../../server/services/idempotency.service.ts');
  idempotency.setIdempotencyV2ExecutorForTests(async (params: any) => {
    return {
      statusCode: 201,
      replayed: false,
      requestHash: 'hash-123',
      body: {
        _id: orderId.toString(),
        userId: userId.toString(),
        type: 'SELL',
        amount: '5.000000',
        status: 'PENDING',
        fiatCurrency: 'KES',
        fiatTotal: '675.00',
        exchangeRate: '135.000000',
        mpesaNumber: '254700111222',
        mpesaName: 'Bob Seller',
      },
    };
  });
  t.after(() => {
    idempotency.resetIdempotencyV2ExecutorForTests();
  });

  const cache = await import('../../../../server/services/cache.service.ts');
  cache.setInvalidateCacheKeysForTests(async () => {});
  t.after(() => {
    cache.setInvalidateCacheKeysForTests(null);
  });

  let sendOrderCreatedCalled = false;
  let sendOrderCreatedResolved = false;

  t.mock.method(ProductEmailNotificationService, 'sendOrderCreated', async () => {
    sendOrderCreatedCalled = true;
    // Simulate slow SMTP delivery of 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));
    sendOrderCreatedResolved = true;
  });

  const req = {
    user: { id: userId.toString(), isAdmin: false },
    headers: { 'idempotency-key': 'key-12345678' },
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as any;
  const res = createResponseMock();

  const start = performance.now();
  await OrderController.createOrder(req, res as any);
  const duration = performance.now() - start;

  assert.equal(res.jsonBody !== undefined, true);
  assert.equal((res.jsonBody as any)._id, orderId.toString());
  assert.equal(sendOrderCreatedCalled, true);
  assert.equal(sendOrderCreatedResolved, false);
  assert.ok(duration < 50, `Order creation response was not immediate: ${duration}ms`);

  // Wait for background notification dispatch to complete
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(sendOrderCreatedResolved, true);
});

test('createOrder blocks implausible BUY M-Pesa codes before order creation or proof relay', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  await setupBuyOrderControllerTest(t, 'UEP1234567');

  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: userId,
    email: 'buyer@example.com',
    username: 'buyer',
  }) as any);
  const createOrderMock = mock.method(OrderService, 'createOrder', async () => ({}) as any);
  const sendOrderCreatedMock = mock.method(ProductEmailNotificationService, 'sendOrderCreated', async () => {});

  t.after(() => findUserMock.mock.restore());
  t.after(() => createOrderMock.mock.restore());
  t.after(() => sendOrderCreatedMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: false },
    headers: { 'idempotency-key': 'key-12345678' },
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as any;
  const res = createResponseMock();

  await assert.rejects(
    OrderController.createOrder(req, res as any),
    (error: any) => {
      assert.equal(error.code, 'MPESA_TRANSACTION_CODE_INVALID');
      assert.equal(
        error.message,
        "We couldn't match this transaction code to the expected payment time. Please check the code and try again.",
      );
      return true;
    },
  );

  assert.equal(findUserMock.mock.callCount(), 0);
  assert.equal(createOrderMock.mock.callCount(), 0);
  assert.equal(sendOrderCreatedMock.mock.callCount(), 0);
});

test('createOrder accepts plausible BUY M-Pesa code but leaves order pending for manual review', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  let createOrderInput: Record<string, unknown> | undefined;
  await setupBuyOrderControllerTest(t, 'u e r 1234567');

  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: userId,
    email: 'buyer@example.com',
    username: 'buyer',
  }) as any);
  const duplicateMock = mock.method(OrderService, 'findByNormalizedTransactionCode', async () => null);
  const createOrderMock = mock.method(OrderService, 'createOrder', async (input) => {
    createOrderInput = input as Record<string, unknown>;
    return {
      _id: orderId,
      userId,
      type: 'BUY',
      amount: '5.000000',
      status: 'PENDING',
      transactionCode: 'UER1234567',
      transactionCodeOriginal: 'u e r 1234567',
      transactionCodeNormalized: 'UER1234567',
      mpesaCodeValidationReason: 'VALID_PLAUSIBLE',
      fiatCurrency: 'KES',
      exchangeRate: '140.000000',
      fiatTotal: '700.00',
      createdAt: new Date('2026-05-27T09:00:00.000Z'),
    } as any;
  });
  let relayCreated = false;
  const relayFindMock = mock.method(OrderProofRelayRepository, 'findByRequest', async () => null);
  const relayCreateMock = mock.method(OrderProofRelayRepository, 'createPending', async () => {
    relayCreated = true;
  });
  const relayClaimMock = mock.method(OrderProofRelayRepository, 'claimPendingByRequest', async () => null);
  const sendOrderCreatedMock = mock.method(ProductEmailNotificationService, 'sendOrderCreated', async () => {});

  t.after(() => findUserMock.mock.restore());
  t.after(() => duplicateMock.mock.restore());
  t.after(() => createOrderMock.mock.restore());
  t.after(() => relayFindMock.mock.restore());
  t.after(() => relayCreateMock.mock.restore());
  t.after(() => relayClaimMock.mock.restore());
  t.after(() => sendOrderCreatedMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: false },
    headers: { 'idempotency-key': 'key-12345678' },
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as any;
  const res = createResponseMock();

  await OrderController.createOrder(req, res as any);

  assert.equal(res.statusCode, 201);
  assert.equal((res.jsonBody as { status: string }).status, 'PENDING');
  assert.equal(createOrderInput?.transactionCode, 'UER1234567');
  assert.equal(createOrderInput?.transactionCodeOriginal, 'u e r 1234567');
  assert.equal(createOrderInput?.transactionCodeNormalized, 'UER1234567');
  assert.equal(createOrderInput?.mpesaCodeValidationReason, 'VALID_PLAUSIBLE');
  assert.deepEqual(createOrderInput?.proofUpload, {
    checksumSha256: crypto.createHash('sha256').update(createProofImage().data).digest('hex'),
    mimeType: 'image/png',
    sizeBytes: 9,
    storageKey: `order-proofs/${userId.toString()}/hash-123/${crypto.createHash('sha256').update(createProofImage().data).digest('hex')}`,
    uploaderUserId: userId,
    createdAt: createOrderInput?.proofUpload && (createOrderInput.proofUpload as { createdAt: unknown }).createdAt,
  });
  assert.equal((createOrderInput?.proofUpload as { createdAt?: unknown })?.createdAt instanceof Date, true);
  assert.equal(createOrderMock.mock.callCount(), 1);
  assert.equal(relayCreated, true);
  assert.equal(sendOrderCreatedMock.mock.callCount(), 1);
});

test('createOrder rejects duplicate normalized M-Pesa transaction codes', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  await setupBuyOrderControllerTest(t, 'UER1234567');

  const findUserMock = mock.method(UserService, 'findById', async () => ({
    _id: userId,
    email: 'buyer@example.com',
    username: 'buyer',
  }) as any);
  const duplicateMock = mock.method(OrderService, 'findByNormalizedTransactionCode', async () => ({
    _id: new mongoose.Types.ObjectId(),
  }) as any);
  const createOrderMock = mock.method(OrderService, 'createOrder', async () => ({}) as any);

  t.after(() => findUserMock.mock.restore());
  t.after(() => duplicateMock.mock.restore());
  t.after(() => createOrderMock.mock.restore());

  const req = {
    user: { id: userId.toString(), isAdmin: false },
    headers: { 'idempotency-key': 'key-12345678' },
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as any;
  const res = createResponseMock();

  await assert.rejects(
    OrderController.createOrder(req, res as any),
    (error: any) => {
      assert.equal(error.code, 'MPESA_TRANSACTION_CODE_INVALID');
      return true;
    },
  );

  assert.equal(createOrderMock.mock.callCount(), 0);
});

test('createOrder locks repeated failed M-Pesa code attempts with a generic message', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  await setupBuyOrderControllerTest(t, 'UEP1234567');

  const req = {
    user: { id: userId.toString(), isAdmin: false },
    headers: { 'idempotency-key': 'key-12345678' },
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  } as any;

  await assert.rejects(OrderController.createOrder(req, createResponseMock() as any));
  await assert.rejects(OrderController.createOrder(req, createResponseMock() as any));
  await assert.rejects(
    OrderController.createOrder(req, createResponseMock() as any),
    (error: any) => {
      assert.equal(error.code, 'MPESA_TRANSACTION_CODE_LOCKED');
      assert.equal(
        error.message,
        'Too many transaction code attempts. Please wait and try again, or contact support for manual review.',
      );
      return true;
    },
  );
});
