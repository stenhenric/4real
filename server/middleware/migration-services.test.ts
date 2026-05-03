import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';
import { resetEnvCacheForTests } from '../config/env.ts';
import { MerchantConfig as MerchantConfigModel } from '../models/MerchantConfig.ts';
import { serializeMatch, serializeOrder } from '../serializers/api.ts';
import { cleanUsername, normalizeEmail, normalizeUsername } from '../services/auth-identity.service.ts';
import { resetCacheServiceForTests } from '../services/cache.service.ts';
import { calculateMatchPayout } from '../services/match-payout.service.ts';
import { getMerchantConfig, updateMerchantConfig } from '../services/merchant-config.service.ts';
import { createOrderRequestSchema, loginPasswordRequestSchema } from '../validation/request-schemas.ts';

const restoreEnv = (key: keyof NodeJS.ProcessEnv, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

function forceMemoryOnlyCacheForTest(t: TestContext) {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();
  resetCacheServiceForTests();

  t.after(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    resetEnvCacheForTests();
    resetCacheServiceForTests();
  });
}

test('auth identity helpers normalize email and username inputs deterministically', () => {
  assert.equal(normalizeEmail('Player@Example.com '), 'player@example.com');
  assert.equal(normalizeUsername(' SketchMaster '), 'sketchmaster');
  assert.equal(cleanUsername(' SketchMaster '), 'SketchMaster');
});

test('loginPasswordRequestSchema accepts email login payloads and rejects username-only payloads', () => {
  const valid = loginPasswordRequestSchema.safeParse({
    email: 'player@example.com',
    password: 'password123',
  });
  const invalid = loginPasswordRequestSchema.safeParse({
    username: 'SketchMaster',
    password: 'password123',
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test('createOrderRequestSchema validates type and amount without trusting proof URLs', () => {
  const valid = createOrderRequestSchema.safeParse({
    type: 'BUY',
    amount: '10.000000',
  });
  const invalid = createOrderRequestSchema.safeParse({
    type: 'BUY',
    amount: '-1.000000',
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test('calculateMatchPayout keeps commission math on the backend', () => {
  const payout = calculateMatchPayout(10);

  assert.equal(payout.totalPot, '20.000000');
  assert.equal(payout.commissionAmount, '2.000000');
  assert.equal(payout.projectedWinnerAmount, '18.000000');
  assert.equal(payout.commissionRate, '0.100000');
});

function createLeanQuery<T>(value: T) {
  return {
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

test('getMerchantConfig prefers server env values and falls back to server-owned defaults', async (t) => {
  forceMemoryOnlyCacheForTest(t);
  const previous = {
    MERCHANT_MPESA_NUMBER: process.env.MERCHANT_MPESA_NUMBER,
    MERCHANT_WALLET_ADDRESS: process.env.MERCHANT_WALLET_ADDRESS,
    MERCHANT_INSTRUCTIONS: process.env.MERCHANT_INSTRUCTIONS,
    MERCHANT_BUY_RATE_KES_PER_USDT: process.env.MERCHANT_BUY_RATE_KES_PER_USDT,
    MERCHANT_SELL_RATE_KES_PER_USDT: process.env.MERCHANT_SELL_RATE_KES_PER_USDT,
  };
  const findOneMock = mock.method(MerchantConfigModel, 'findOne', (() => createLeanQuery(null)) as any);
  t.after(() => findOneMock.mock.restore());

  process.env.MERCHANT_MPESA_NUMBER = 'SERVER-123';
  process.env.MERCHANT_WALLET_ADDRESS = 'SERVER-WALLET';
  process.env.MERCHANT_INSTRUCTIONS = 'Server instructions';
  process.env.MERCHANT_BUY_RATE_KES_PER_USDT = '141.5';
  process.env.MERCHANT_SELL_RATE_KES_PER_USDT = '137.25';
  resetEnvCacheForTests();
  resetCacheServiceForTests();

  assert.deepEqual(await getMerchantConfig(), {
    mpesaNumber: 'SERVER-123',
    walletAddress: 'SERVER-WALLET',
    instructions: 'Server instructions',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '141.500000',
    sellRateKesPerUsdt: '137.250000',
  });

  delete process.env.MERCHANT_MPESA_NUMBER;
  delete process.env.MERCHANT_WALLET_ADDRESS;
  delete process.env.MERCHANT_INSTRUCTIONS;
  delete process.env.MERCHANT_BUY_RATE_KES_PER_USDT;
  delete process.env.MERCHANT_SELL_RATE_KES_PER_USDT;
  resetEnvCacheForTests();
  resetCacheServiceForTests();

  assert.deepEqual(await getMerchantConfig(), {
    mpesaNumber: 'Not configured',
    walletAddress: 'Not configured',
    instructions: 'Follow merchant instructions provided by support.',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '0.000000',
    sellRateKesPerUsdt: '0.000000',
  });

  restoreEnv('MERCHANT_MPESA_NUMBER', previous.MERCHANT_MPESA_NUMBER);
  restoreEnv('MERCHANT_WALLET_ADDRESS', previous.MERCHANT_WALLET_ADDRESS);
  restoreEnv('MERCHANT_INSTRUCTIONS', previous.MERCHANT_INSTRUCTIONS);
  restoreEnv('MERCHANT_BUY_RATE_KES_PER_USDT', previous.MERCHANT_BUY_RATE_KES_PER_USDT);
  restoreEnv('MERCHANT_SELL_RATE_KES_PER_USDT', previous.MERCHANT_SELL_RATE_KES_PER_USDT);
  resetEnvCacheForTests();
  resetCacheServiceForTests();
});

test('updateMerchantConfig merges and persists merchant rates and settlement details', async (t) => {
  forceMemoryOnlyCacheForTest(t);
  const findOneMock = mock.method(MerchantConfigModel, 'findOne', (() => createLeanQuery({
    mpesaNumber: '900100',
    walletAddress: 'EQ123',
    instructions: 'Existing instructions',
    buyRateKesPerUsdt: '140.000000',
    sellRateKesPerUsdt: '135.000000',
  })) as any);
  const findOneAndUpdateMock = mock.method(MerchantConfigModel, 'findOneAndUpdate', async () => null as any);

  t.after(() => findOneMock.mock.restore());
  t.after(() => findOneAndUpdateMock.mock.restore());

  const updated = await updateMerchantConfig({
    buyRateKesPerUsdt: '150.000000',
    sellRateKesPerUsdt: '145.000000',
    instructions: 'Updated instructions',
  });

  assert.deepEqual(updated, {
    mpesaNumber: '900100',
    walletAddress: 'EQ123',
    instructions: 'Updated instructions',
    fiatCurrency: 'KES',
    buyRateKesPerUsdt: '150.000000',
    sellRateKesPerUsdt: '145.000000',
  });

  assert.equal(findOneAndUpdateMock.mock.callCount(), 1);
  const updatePayload = findOneAndUpdateMock.mock.calls[0].arguments[1] as { $set: Record<string, unknown> };
  assert.equal(updatePayload.$set.buyRateKesPerUsdt, '150.000000');
  assert.equal(updatePayload.$set.sellRateKesPerUsdt, '145.000000');
  assert.equal(updatePayload.$set.instructions, 'Updated instructions');
});

test('serializeMatch returns the shared DTO shape with string identifiers', () => {
  const match = {
    _id: new mongoose.Types.ObjectId(),
    roomId: 'room-123',
    p1Username: 'PlayerOne',
    p2Username: 'PlayerTwo',
    player1Id: new mongoose.Types.ObjectId(),
    player2Id: new mongoose.Types.ObjectId(),
    status: 'active',
    winnerId: undefined,
    wager: 12,
    isPrivate: true,
    moveHistory: [{ userId: 'p1', col: 0, row: 5 }],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as any;

  const dto = serializeMatch(match);

  assert.equal(typeof dto._id, 'string');
  assert.equal(typeof dto.player1Id, 'string');
  assert.equal(typeof dto.player2Id, 'string');
  assert.equal(dto.wager, '12.000000');
  assert.equal(dto.projectedWinnerAmount, '21.600000');
  assert.equal(dto.commissionRate, '0.100000');
  assert.equal(dto.createdAt, '2026-01-01T00:00:00.000Z');
});

test('serializeOrder returns a stable DTO for populated and unpopulated users', () => {
  const createdAt = new Date('2026-01-02T00:00:00.000Z');
  const orderId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const populated = serializeOrder({
    _id: orderId,
    userId: { _id: userId, username: 'InkAdmin' },
    type: 'BUY',
    amount: 5,
    status: 'PENDING',
    transactionCode: 'QWE123ABC',
    fiatCurrency: 'KES',
    exchangeRate: 140,
    fiatTotal: 700,
    proof: {
      provider: 'telegram',
      url: 'https://t.me/c/123/45',
      messageId: '45',
      chatId: '-100123',
    },
    createdAt,
  } as any);
  const unpopulated = serializeOrder({
    _id: orderId,
    userId,
    type: 'SELL',
    amount: 7,
    status: 'DONE',
    createdAt,
  } as any);

  assert.deepEqual(populated.userId, {
    id: userId.toString(),
    username: 'InkAdmin',
  });
  assert.equal(unpopulated.userId, userId.toString());
  assert.equal(populated.createdAt, '2026-01-02T00:00:00.000Z');
  assert.equal(populated.proof?.provider, 'telegram');
  assert.equal(populated.transactionCode, 'QWE123ABC');
  assert.equal(populated.amount, '5.000000');
  assert.equal(populated.exchangeRate, '140.000000');
  assert.equal(populated.fiatTotal, '700.00');
});
