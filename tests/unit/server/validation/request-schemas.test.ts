import assert from 'node:assert/strict';
import test from 'node:test';

import { withdrawRequestSchema } from '../../../../server/validation/request-schemas.ts';

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
