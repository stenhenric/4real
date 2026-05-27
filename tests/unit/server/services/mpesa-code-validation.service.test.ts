import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMpesaCodeAttemptLock,
  recordFailedMpesaCodeAttempt,
  resetMpesaCodeValidationForTests,
  setMpesaCodeAttemptDependenciesForTests,
  validateMpesaTransactionCode,
  type MpesaCodeValidationConfig,
} from '../../../../server/services/mpesa-code-validation.service.ts';

const TEST_CONFIG: MpesaCodeValidationConfig = {
  allowedYears: new Map([
    ['R', 2023],
    ['S', 2024],
    ['T', 2025],
    ['U', 2026],
    ['V', 2027],
  ]),
  timeZone: 'Africa/Nairobi',
  allowInternalSpaces: true,
  previousDayGraceMinutes: 120,
};

const NOW_MAY_27_EAT = new Date('2026-05-27T09:00:00.000Z');

test.afterEach(() => {
  resetMpesaCodeValidationForTests();
});

test('accepts a valid M-Pesa transaction code for today in Africa/Nairobi', () => {
  const result = validateMpesaTransactionCode({
    input: 'UER1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  });

  assert.equal(result.status, 'valid');
  assert.equal(result.reasonCode, 'VALID_PLAUSIBLE');
  assert.equal(result.normalizedCode, 'UER1234567');
  assert.deepEqual(result.decodedLocalDate, { year: 2026, month: 5, day: 27 });
});

test('normalizes lowercase and accidental internal spaces', () => {
  const result = validateMpesaTransactionCode({
    input: 'u e r 1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  });

  assert.equal(result.status, 'valid');
  assert.equal(result.normalizedCode, 'UER1234567');
});

test('accepts previous-day code within the configured midnight grace window', () => {
  const result = validateMpesaTransactionCode({
    input: 'UEQ1234567',
    now: new Date('2026-05-26T21:30:00.000Z'),
    config: TEST_CONFIG,
  });

  assert.equal(result.status, 'valid');
  assert.equal(result.reasonCode, 'VALID_PLAUSIBLE');
  assert.deepEqual(result.decodedLocalDate, { year: 2026, month: 5, day: 26 });
});

test('rejects future-dated code', () => {
  const result = validateMpesaTransactionCode({
    input: 'UES1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.reasonCode, 'DATE_IN_FUTURE');
});

test('rejects old code outside the payment window', () => {
  const result = validateMpesaTransactionCode({
    input: 'UEP1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.reasonCode, 'DATE_TOO_OLD');
});

test('rejects invalid length and invalid characters', () => {
  assert.equal(validateMpesaTransactionCode({
    input: 'UER123',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_LENGTH');

  assert.equal(validateMpesaTransactionCode({
    input: 'UER12345!7',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_CHARACTERS');
});

test('rejects invalid year, month, and day prefixes', () => {
  assert.equal(validateMpesaTransactionCode({
    input: 'WER1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_DATE_PREFIX');

  assert.equal(validateMpesaTransactionCode({
    input: 'UMR1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_DATE_PREFIX');

  assert.equal(validateMpesaTransactionCode({
    input: 'UEW1234567',
    now: NOW_MAY_27_EAT,
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_DATE_PREFIX');
});

test('rejects impossible calendar dates', () => {
  assert.equal(validateMpesaTransactionCode({
    input: 'UBU1234567',
    now: new Date('2026-02-27T09:00:00.000Z'),
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_REAL_DATE');

  assert.equal(validateMpesaTransactionCode({
    input: 'UDV1234567',
    now: new Date('2026-04-27T09:00:00.000Z'),
    config: TEST_CONFIG,
  }).reasonCode, 'INVALID_REAL_DATE');
});

test('locks the attempt context after too many failed attempts', async () => {
  const now = new Date('2026-05-27T09:00:00.000Z');
  setMpesaCodeAttemptDependenciesForTests({ now: () => now });

  await recordFailedMpesaCodeAttempt('user-1:BUY:10.000000:KES:1325.00');
  await recordFailedMpesaCodeAttempt('user-1:BUY:10.000000:KES:1325.00');
  const result = await recordFailedMpesaCodeAttempt('user-1:BUY:10.000000:KES:1325.00');
  const lock = await getMpesaCodeAttemptLock('user-1:BUY:10.000000:KES:1325.00');

  assert.equal(result.count, 3);
  assert.ok(result.lockedUntil);
  assert.equal(lock?.count, 3);
  assert.ok(lock?.lockedUntil);
});
