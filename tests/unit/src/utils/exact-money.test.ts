import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMoneyValue,
  isPositiveMoney,
  moneyToNumber,
  normalizeFixedScaleAmount,
} from '../../../../src/utils/exact-money.ts';

test('normalizeFixedScaleAmount pads and trims plain decimal user input', () => {
  assert.equal(normalizeFixedScaleAmount(' 001.2 ', { scale: 6, label: 'Amount' }), '1.200000');
  assert.equal(normalizeFixedScaleAmount('0', { scale: 2, label: 'KES amount' }), '0.00');
});

test('normalizeFixedScaleAmount rejects ambiguous money input and over-precision', () => {
  assert.throws(
    () => normalizeFixedScaleAmount('1e3', { scale: 6, label: 'Amount' }),
    /plain decimal amount/i,
  );
  assert.throws(
    () => normalizeFixedScaleAmount('-1', { scale: 6, label: 'Amount' }),
    /plain decimal amount/i,
  );
  assert.throws(
    () => normalizeFixedScaleAmount('1.1234567', { scale: 6, label: 'Amount' }),
    /at most 6 decimal places/i,
  );
});

test('normalizeFixedScaleAmount enforces positive-only flows when zero is disallowed', () => {
  assert.throws(
    () => normalizeFixedScaleAmount('0.000000', { scale: 6, allowZero: false, label: 'Withdrawal amount' }),
    /greater than 0/i,
  );
  assert.equal(
    normalizeFixedScaleAmount('0.000001', { scale: 6, allowZero: false, label: 'Withdrawal amount' }),
    '0.000001',
  );
});

test('money display helpers fail closed for missing or invalid values', () => {
  assert.equal(moneyToNumber(undefined), 0);
  assert.equal(moneyToNumber('not-money'), 0);
  assert.equal(moneyToNumber(Number.POSITIVE_INFINITY), 0);
  assert.equal(isPositiveMoney('0.000001'), true);
  assert.equal(isPositiveMoney('0'), false);
  assert.equal(formatMoneyValue('12.5', 2), '12.50');
});
