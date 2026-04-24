import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { resetEnvCacheForTests } from '../config/env.ts';
import { serializeMatch, serializeOrder } from '../serializers/api.ts';
import { resolveAuthEmail } from '../services/auth-identity.service.ts';
import { calculateMatchPayout } from '../services/match-payout.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import { createOrderRequestSchema, loginRequestSchema } from '../validation/request-schemas.ts';

const restoreEnv = (key: keyof NodeJS.ProcessEnv, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

test('resolveAuthEmail derives the synthetic account email from username logins', () => {
  assert.equal(resolveAuthEmail({ username: 'SketchMaster' }), 'sketchmaster@4real.app');
  assert.equal(resolveAuthEmail({ identifier: 'InkPlayer' }), 'inkplayer@4real.app');
  assert.equal(resolveAuthEmail({ email: 'Player@Example.com' }), 'player@example.com');
});

test('loginRequestSchema accepts username-only login payloads', () => {
  const parsed = loginRequestSchema.safeParse({ username: 'SketchMaster', password: 'password123' });
  assert.equal(parsed.success, true);
});

test('createOrderRequestSchema only accepts http and https proof URLs', () => {
  const valid = createOrderRequestSchema.safeParse({
    type: 'BUY',
    amount: 10,
    proofImageUrl: 'https://example.com/proof.png',
  });
  const invalid = createOrderRequestSchema.safeParse({
    type: 'BUY',
    amount: 10,
    proofImageUrl: 'javascript:alert(1)',
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test('calculateMatchPayout keeps commission math on the backend', () => {
  const payout = calculateMatchPayout(10);

  assert.equal(payout.totalPot, 20);
  assert.equal(payout.commissionAmount, 2);
  assert.equal(payout.projectedWinnerAmount, 18);
  assert.equal(payout.commissionRate, 0.1);
});

test('getMerchantConfig prefers server env values and falls back to legacy VITE values', () => {
  const previous = {
    MERCHANT_MPESA_NUMBER: process.env.MERCHANT_MPESA_NUMBER,
    MERCHANT_WALLET_ADDRESS: process.env.MERCHANT_WALLET_ADDRESS,
    MERCHANT_INSTRUCTIONS: process.env.MERCHANT_INSTRUCTIONS,
    VITE_MERCHANT_MPESA_NUMBER: process.env.VITE_MERCHANT_MPESA_NUMBER,
    VITE_MERCHANT_WALLET_ADDRESS: process.env.VITE_MERCHANT_WALLET_ADDRESS,
    VITE_MERCHANT_INSTRUCTIONS: process.env.VITE_MERCHANT_INSTRUCTIONS,
  };

  process.env.MERCHANT_MPESA_NUMBER = 'SERVER-123';
  process.env.MERCHANT_WALLET_ADDRESS = 'SERVER-WALLET';
  process.env.MERCHANT_INSTRUCTIONS = 'Server instructions';
  process.env.VITE_MERCHANT_MPESA_NUMBER = 'LEGACY-123';
  process.env.VITE_MERCHANT_WALLET_ADDRESS = 'LEGACY-WALLET';
  process.env.VITE_MERCHANT_INSTRUCTIONS = 'Legacy instructions';
  resetEnvCacheForTests();

  assert.deepEqual(getMerchantConfig(), {
    mpesaNumber: 'SERVER-123',
    walletAddress: 'SERVER-WALLET',
    instructions: 'Server instructions',
  });

  delete process.env.MERCHANT_MPESA_NUMBER;
  delete process.env.MERCHANT_WALLET_ADDRESS;
  delete process.env.MERCHANT_INSTRUCTIONS;
  resetEnvCacheForTests();

  assert.deepEqual(getMerchantConfig(), {
    mpesaNumber: 'LEGACY-123',
    walletAddress: 'LEGACY-WALLET',
    instructions: 'Legacy instructions',
  });

  restoreEnv('MERCHANT_MPESA_NUMBER', previous.MERCHANT_MPESA_NUMBER);
  restoreEnv('MERCHANT_WALLET_ADDRESS', previous.MERCHANT_WALLET_ADDRESS);
  restoreEnv('MERCHANT_INSTRUCTIONS', previous.MERCHANT_INSTRUCTIONS);
  restoreEnv('VITE_MERCHANT_MPESA_NUMBER', previous.VITE_MERCHANT_MPESA_NUMBER);
  restoreEnv('VITE_MERCHANT_WALLET_ADDRESS', previous.VITE_MERCHANT_WALLET_ADDRESS);
  restoreEnv('VITE_MERCHANT_INSTRUCTIONS', previous.VITE_MERCHANT_INSTRUCTIONS);
  resetEnvCacheForTests();
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
  assert.equal(dto.projectedWinnerAmount, 21.6);
  assert.equal(dto.commissionRate, 0.1);
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
    proofImageUrl: 'https://example.com/proof.png',
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
});
