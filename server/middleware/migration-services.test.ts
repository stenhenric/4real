import assert from 'node:assert/strict';
import test from 'node:test';
import { resetEnvCacheForTests } from '../config/env.ts';
import { resolveAuthEmail } from '../services/auth-identity.service.ts';
import { calculateMatchPayout } from '../services/match-payout.service.ts';
import { getMerchantConfig } from '../services/merchant-config.service.ts';
import { loginRequestSchema } from '../validation/request-schemas.ts';

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
