import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { OrderController } from '../../../../server/controllers/order.controller.ts';
import { Order } from '../../../../server/models/Order.ts';
import { AuditService } from '../../../../server/services/audit.service.ts';
import { OrderService } from '../../../../server/services/order.service.ts';
import { ProductEmailNotificationService } from '../../../../server/services/product-email-notification.service.ts';
import { TransactionService } from '../../../../server/services/transaction.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';

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
