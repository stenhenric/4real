import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../config/env.ts';
import { Order } from '../models/Order.ts';
import { MerchantDashboardService } from '../services/merchant-dashboard.service.ts';
import { setHotWalletRuntimeForTests } from '../services/hot-wallet-runtime.service.ts';

function createQuery<T>(items: T[]) {
  return {
    sort() {
      return this;
    },
    populate() {
      return this;
    },
    select() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return items;
    },
  };
}

function registerEnvCleanup(t: TestContext) {
  const previous = {
    HOT_WALLET_MIN_TON_BALANCE: process.env.HOT_WALLET_MIN_TON_BALANCE,
    HOT_WALLET_MIN_USDT_BALANCE: process.env.HOT_WALLET_MIN_USDT_BALANCE,
    HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT: process.env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  process.env.HOT_WALLET_MIN_TON_BALANCE = '1';
  process.env.HOT_WALLET_MIN_USDT_BALANCE = '2';
  process.env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT = '0.5';
  resetEnvCacheForTests();

  t.after(() => {
    if (previous.HOT_WALLET_MIN_TON_BALANCE === undefined) {
      delete process.env.HOT_WALLET_MIN_TON_BALANCE;
    } else {
      process.env.HOT_WALLET_MIN_TON_BALANCE = previous.HOT_WALLET_MIN_TON_BALANCE;
    }

    if (previous.HOT_WALLET_MIN_USDT_BALANCE === undefined) {
      delete process.env.HOT_WALLET_MIN_USDT_BALANCE;
    } else {
      process.env.HOT_WALLET_MIN_USDT_BALANCE = previous.HOT_WALLET_MIN_USDT_BALANCE;
    }

    if (previous.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT === undefined) {
      delete process.env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT;
    } else {
      process.env.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT = previous.HOT_WALLET_LEDGER_MISMATCH_TOLERANCE_USDT;
    }

    if (previous.JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous.JWT_SECRET;
    }

    if (previous.NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous.NODE_ENV;
    }

    resetEnvCacheForTests();
    setHotWalletRuntimeForTests(null);
  });
}

test('getOrderDesk applies pagination metadata and derives risk flags for admin review', async (t) => {
  registerEnvCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const recentUser = {
    _id: userId,
    username: 'fresh-trader',
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
  };

  const findMock = mock.method(Order, 'find', ((filter: Record<string, unknown>) => {
    assert.equal(filter.status, 'PENDING');
    assert.equal(filter.type, 'BUY');

    return createQuery([
      {
        _id: orderId,
        userId: recentUser,
        type: 'BUY',
        amount: 6_000,
        status: 'PENDING',
        proofImageUrl: 'https://example.com/proof.png',
        createdAt: new Date(Date.now() - 20 * 60 * 1000),
      },
    ]);
  }) as any);
  const countMock = mock.method(Order, 'countDocuments', async () => 1);
  const aggregateMock = mock.method(Order, 'aggregate', async () => [
    { _id: userId, doneCount: 0, doneVolume: 0 },
  ]);

  t.after(() => findMock.mock.restore());
  t.after(() => countMock.mock.restore());
  t.after(() => aggregateMock.mock.restore());

  const result = await MerchantDashboardService.getOrderDesk({
    page: 1,
    pageSize: 25,
    status: 'PENDING',
    type: 'BUY',
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.pagination.totalPages, 1);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].riskLevel, 'high');
  assert.match(result.orders[0].riskFlags.join(' '), /Large ticket size/);
  assert.match(result.orders[0].riskFlags.join(' '), /New account/);
});

test('getOrderDesk keeps established small-ticket traders in the low-risk bucket', async (t) => {
  registerEnvCleanup(t);

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const establishedUser = {
    _id: userId,
    username: 'steady-trader',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  };

  const findMock = mock.method(Order, 'find', ((filter: Record<string, unknown>) => {
    assert.equal(filter.type, 'SELL');

    return createQuery([
      {
        _id: orderId,
        userId: establishedUser,
        type: 'SELL',
        amount: 25,
        status: 'DONE',
        proofImageUrl: 'https://example.com/proof-small.png',
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    ]);
  }) as any);
  const countMock = mock.method(Order, 'countDocuments', async () => 30);
  const aggregateMock = mock.method(Order, 'aggregate', async () => [
    { _id: userId, doneCount: 10, doneVolume: 250 },
  ]);

  t.after(() => findMock.mock.restore());
  t.after(() => countMock.mock.restore());
  t.after(() => aggregateMock.mock.restore());

  const result = await MerchantDashboardService.getOrderDesk({
    page: 1,
    pageSize: 25,
    status: 'ALL',
    type: 'SELL',
  });

  assert.equal(result.pagination.total, 30);
  assert.equal(result.pagination.totalPages, 2);
  assert.equal(result.orders[0].riskLevel, 'low');
  assert.equal(result.orders[0].riskFlags.length, 0);
});
