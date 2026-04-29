import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import { TonClient } from '@ton/ton';
import mongoose from 'mongoose';

import { resetEnvCacheForTests } from '../config/env.ts';
import { MerchantConfig as MerchantConfigModel } from '../models/MerchantConfig.ts';
import { Order } from '../models/Order.ts';
import { User, SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
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

function createLeanQuery<T>(value: T) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function hasTrustedSymbol(value: object) {
  return Object.getOwnPropertySymbols(value).some((symbol) => symbol.toString() === 'Symbol(mongoose#trustedSymbol)');
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
        proof: {
          provider: 'telegram',
          url: 'https://t.me/c/123/11',
          messageId: '11',
          chatId: '-100123',
        },
        transactionCode: 'QWE123ABC',
        fiatCurrency: 'KES',
        exchangeRate: 140,
        fiatTotal: 840000,
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
  assert.deepEqual(result.orders[0].proof, {
    provider: 'telegram',
    url: 'https://t.me/c/123/11',
    messageId: '11',
    chatId: '-100123',
  });
  assert.equal(result.orders[0].transactionCode, 'QWE123ABC');
  assert.equal(result.orders[0].fiatCurrency, 'KES');
  assert.equal(result.orders[0].exchangeRate, 140);
  assert.equal(result.orders[0].fiatTotal, 840000);
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
        proof: {
          provider: 'telegram',
          url: 'https://t.me/c/123/12',
          messageId: '12',
          chatId: '-100123',
        },
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

test('getDashboard resolves merchant config, exposes stale-match job status, and trusts the completed-orders date filter', async (t) => {
  registerEnvCleanup(t);

  setHotWalletRuntimeForTests({
    hotWalletAddress: 'EQBbzHJl0acwWnFY9M9sNGz8hyC-gZjspQ99YpYTq0VHdbtM',
    hotJettonWallet: 'EQAgIDeXltmujlpxRKSJKrIq8t28SpHVJRR1GxkCS0G6nT-K',
    derivedHotJettonWallet: 'EQAgIDeXltmujlpxRKSJKrIq8t28SpHVJRR1GxkCS0G6nT-K',
  });

  const expectedConfig = {
    mpesaNumber: '900800700',
    walletAddress: 'UQTestWallet',
    instructions: 'Send exact amount and upload screenshot.',
    fiatCurrency: 'KES' as const,
    buyRateKesPerUsdt: 132.5,
    sellRateKesPerUsdt: 128.75,
  };

  const orderFilters: Record<string, unknown>[] = [];
  const findMock = mock.method(Order, 'find', ((filter: Record<string, unknown>) => {
    orderFilters.push(filter);

    if (filter.status === 'PENDING') {
      return createQuery([]);
    }

    if (filter.status === 'DONE') {
      return createLeanQuery([
        {
          amount: 45,
          createdAt: new Date('2026-04-25T10:00:00.000Z'),
        },
      ]);
    }

    throw new Error(`Unexpected Order.find filter: ${JSON.stringify(filter)}`);
  }) as any);
  const sumBalanceMock = mock.method(UserBalanceRepository, 'sumBalanceRawForLedger', async () => 0n);
  const tonBalanceMock = mock.method(TonClient.prototype as TonClient, 'getBalance', async () => 2_500_000_000n);
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({
    status: 200,
    ok: true,
    async json() {
      return {
        jetton_wallets: [{ balance: '25000000' }],
      };
    },
  }) as any);
  const configMock = mock.method(MerchantConfigModel, 'findOne', (() => createLeanQuery(expectedConfig)) as any);
  const commissionBalanceMock = mock.method(UserBalanceRepository, 'findByUserId', async () => ({
    userId: SYSTEM_COMMISSION_ACCOUNT_ID,
    balanceRaw: '0',
    totalDepositedRaw: '0',
    totalWithdrawnRaw: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const originalDb = mongoose.connection.db;
  Object.defineProperty(mongoose.connection, 'db', {
    configurable: true,
    value: {
      collection(name: string) {
        if (name === 'deposits') {
          return {
            find() {
              return {
                project() {
                  return this;
                },
                sort() {
                  return this;
                },
                async toArray() {
                  return [];
                },
              };
            },
          };
        }

        if (name === 'withdrawals') {
          return {
            find() {
              return {
                project() {
                  return this;
                },
                sort() {
                  return this;
                },
                async toArray() {
                  return [];
                },
              };
            },
            aggregate() {
              return {
                async toArray() {
                  return [];
                },
              };
            },
          };
        }

        if (name === 'unmatched_deposits') {
          return {
            find() {
              return {
                project() {
                  return this;
                },
                sort() {
                  return this;
                },
                limit() {
                  return this;
                },
                async toArray() {
                  return [];
                },
              };
            },
            async countDocuments() {
              return 0;
            },
          };
        }

        throw new Error(`Unexpected collection lookup: ${name}`);
      },
    },
  });

  t.after(() => findMock.mock.restore());
  t.after(() => sumBalanceMock.mock.restore());
  t.after(() => tonBalanceMock.mock.restore());
  t.after(() => fetchMock.mock.restore());
  t.after(() => configMock.mock.restore());
  t.after(() => commissionBalanceMock.mock.restore());
  t.after(() => {
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      value: originalDb,
    });
  });

  const dashboard = await MerchantDashboardService.getDashboard(null);
  const doneFilter = orderFilters.find((filter) => filter.status === 'DONE');

  assert.ok(doneFilter);
  assert.ok(hasTrustedSymbol(doneFilter));
  assert.ok((doneFilter.createdAt as { $gte: unknown }).$gte instanceof Date);
  assert.deepEqual(sumBalanceMock.mock.calls[0].arguments[0], {
    excludeUserIds: [SYSTEM_COMMISSION_ACCOUNT_ID],
  });
  assert.deepEqual(dashboard.liquidity.merchantConfig, expectedConfig);
  assert.ok(dashboard.liquidity.jobs.some((job) => job.key === 'staleMatchExpiry'));
});
