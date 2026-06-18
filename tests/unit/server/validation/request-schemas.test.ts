import assert from 'node:assert/strict';
import test from 'node:test';

import {
  avatarSettingsRequestSchema,
  confirmPasswordRequestSchema,
  merchantDepositReplayWindowRequestSchema,
  withdrawRequestSchema,
} from '../../../../server/validation/request-schemas.ts';

const VALID_TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

test('withdrawRequestSchema rejects withdrawals below the 1.5 USDT minimum', () => {
  const result = withdrawRequestSchema.safeParse({
    toAddress: VALID_TON_ADDRESS,
    amountUsdt: '1.499999',
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0]?.message ?? '', /below the allowed minimum/i);
});

test('withdrawRequestSchema accepts the 1.5 USDT withdrawal minimum', () => {
  const result = withdrawRequestSchema.safeParse({
    toAddress: VALID_TON_ADDRESS,
    amountUsdt: '1.5',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.amountUsdt, '1.500000');
});

test('avatarSettingsRequestSchema accepts only known metadata values', () => {
  const valid = avatarSettingsRequestSchema.safeParse({
    preset: 'pencil-face-03',
    color: 'teal',
  });
  assert.equal(valid.success, true);

  const invalid = avatarSettingsRequestSchema.safeParse({
    preset: 'https://example.com/avatar.png',
    color: 'teal',
  });
  assert.equal(invalid.success, false);
});

test('confirmPasswordRequestSchema allows passwordless fresh-auth confirmation requests', () => {
  const passwordless = confirmPasswordRequestSchema.safeParse({});
  assert.equal(passwordless.success, true);

  const localPassword = confirmPasswordRequestSchema.safeParse({ password: 'current-password' });
  assert.equal(localPassword.success, true);
  assert.equal(localPassword.data?.password, 'current-password');
});

test('merchantDepositReplayWindowRequestSchema rejects string booleans instead of coercing false to true', () => {
  const valid = merchantDepositReplayWindowRequestSchema.safeParse({
    sinceUnixTime: 1,
    untilUnixTime: 2,
    dryRun: false,
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data?.dryRun, false);

  const invalid = merchantDepositReplayWindowRequestSchema.safeParse({
    sinceUnixTime: 1,
    untilUnixTime: 2,
    dryRun: 'false',
  });
  assert.equal(invalid.success, false);
});
