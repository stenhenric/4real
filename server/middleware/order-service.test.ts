import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { OrderController } from '../controllers/order.controller.ts';
import { Order } from '../models/Order.ts';
import { AuditService } from '../services/audit.service.ts';
import { OrderService } from '../services/order.service.ts';
import { ProductEmailNotificationService } from '../services/product-email-notification.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { UserService } from '../services/user.service.ts';

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
    jsonBody: undefined as unknown,
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
  };
}

test('createOrder reserves SELL balances and creates the pending ledger entry in one transaction', async (t) => {
  registerSessionCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const deductMock = mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: userId } as any));
  const createOrderMock = mock.method(Order, 'create', async () => ([{
    _id: orderId,
    userId,
    type: 'SELL',
    amount: 12,
    status: 'PENDING',
    proof: {
      provider: 'telegram',
      url: 'https://t.me/c/123/10',
      messageId: '10',
      chatId: '-100123',
    },
    transactionCode: 'QWE123ABC',
    fiatCurrency: 'KES',
    exchangeRate: 140,
    fiatTotal: 1680,
    createdAt: new Date(),
  }] as any));
  const auditMock = mock.method(AuditService, 'record', async () => {});
  const createTransactionMock = mock.method(TransactionService, 'createTransaction', async () => ({ _id: 'tx-1' } as any));

  t.after(() => deductMock.mock.restore());
  t.after(() => createOrderMock.mock.restore());
  t.after(() => auditMock.mock.restore());
  t.after(() => createTransactionMock.mock.restore());

  const order = await OrderService.createOrder({
    userId,
    type: 'SELL',
    amount: 12,
    proof: {
      provider: 'telegram',
      url: 'https://t.me/c/123/10',
      messageId: '10',
      chatId: '-100123',
    },
    transactionCode: 'QWE123ABC',
    fiatCurrency: 'KES',
    exchangeRate: 140,
    fiatTotal: 1680,
  });

  assert.equal(order._id.toString(), orderId.toString());
  assert.equal(deductMock.mock.callCount(), 1);
  assert.equal(deductMock.mock.calls[0].arguments[0], userId.toString());
  assert.equal(createOrderMock.mock.callCount(), 1);
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
    amount: 7,
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
  assert.equal(orderDocument.status, 'REJECTED');
  assert.equal(savedWithSession, true);
  assert.equal(updateBalanceMock.mock.callCount(), 1);
  assert.equal(updateBalanceMock.mock.calls[0].arguments[0], userId.toString());
  assert.equal(updateTransactionMock.mock.callCount(), 1);
  assert.equal(updateTransactionMock.mock.calls[0].arguments[1], 'REJECTED');
  assert.equal(createTransactionMock.mock.callCount(), 1);
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { type: string }).type, 'SELL_P2P_REFUND');
  assert.equal((createTransactionMock.mock.calls[0].arguments[0] as { amount: number }).amount, 7);
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
  const updateOrderStatusMock = mock.method(OrderService, 'updateOrderStatus', async () => order as any);
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
