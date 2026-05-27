import assert from 'node:assert/strict';
import test from 'node:test';

import {
  divideRounded,
  formatUserFacingDecimal,
  formatKesAmount,
  formatRate,
  formatUsdtAmount,
  multiplyScaledAmounts,
  parseKesAmount,
  parseRate,
  parseUsdtAmount,
  rawAmountToDisplayString,
} from '../../../../server/utils/money.ts';

test('USDT, KES, and rate parsers normalize fixed-scale business amounts', () => {
  assert.equal(parseUsdtAmount('1').toString(), '1000000');
  assert.equal(parseUsdtAmount('0001.25').toString(), '1250000');
  assert.equal(parseKesAmount('140.5').toString(), '14050');
  assert.equal(parseRate('135.123456').toString(), '135123456');

  assert.equal(formatUsdtAmount(1250000n), '1.250000');
  assert.equal(formatKesAmount(14050n), '140.50');
  assert.equal(formatRate(135123456n), '135.123456');
});

test('fixed-scale money parsing rejects ambiguous or over-precise inputs', () => {
  assert.throws(() => parseUsdtAmount(''), /cannot be empty/i);
  assert.throws(() => parseUsdtAmount('1e6'), /invalid decimal/i);
  assert.throws(() => parseUsdtAmount('1,000.00'), /invalid decimal/i);
  assert.throws(() => parseKesAmount('10.001'), /exceeds 2 decimal places/i);
  assert.throws(() => parseRate('1.1234567'), /exceeds 6 decimal places/i);
});

test('scaled multiplication preserves cents using explicit rounding rules', () => {
  const usdtRaw = parseUsdtAmount('12.345678');
  const rateRaw = parseRate('135.125000');

  assert.equal(
    multiplyScaledAmounts({
      leftRaw: usdtRaw,
      leftScale: 6,
      rightRaw: rateRaw,
      rightScale: 6,
      resultScale: 2,
      rounding: 'half-up',
    }).toString(),
    '166821',
  );

  assert.equal(
    multiplyScaledAmounts({
      leftRaw: usdtRaw,
      leftScale: 6,
      rightRaw: rateRaw,
      rightScale: 6,
      resultScale: 2,
      rounding: 'down',
    }).toString(),
    '166820',
  );
});

test('divideRounded handles negative values symmetrically and rejects zero divisors', () => {
  assert.equal(divideRounded(5n, 2n), 3n);
  assert.equal(divideRounded(-5n, 2n), -3n);
  assert.equal(divideRounded(5n, -2n), -3n);
  assert.equal(divideRounded(-5n, -2n), 3n);
  assert.equal(divideRounded(5n, 2n, 'down'), 2n);
  assert.throws(() => divideRounded(1n, 0n), /divide by zero/i);
});

test('display formatting keeps raw blockchain amounts at six decimals', () => {
  assert.equal(rawAmountToDisplayString('0'), '0.000000');
  assert.equal(rawAmountToDisplayString('42'), '0.000042');
  assert.equal(rawAmountToDisplayString(42_000_000n), '42.000000');
});

test('user-facing decimal formatting trims insignificant zeros and caps precision', () => {
  assert.equal(formatUserFacingDecimal('0.200000'), '0.2');
  assert.equal(formatUserFacingDecimal('1.000000'), '1');
  assert.equal(formatUserFacingDecimal('12.340000'), '12.34');
  assert.equal(formatUserFacingDecimal('12.3456'), '12.346');
  assert.equal(formatUserFacingDecimal('0.0005'), '0.001');
  assert.equal(formatUserFacingDecimal('-2.500000'), '-2.5');
});
