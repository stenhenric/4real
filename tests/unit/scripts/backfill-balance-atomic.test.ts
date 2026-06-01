import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import {
  assertBackfillCanRun,
  buildAtomicBackfillOperation,
  parseBackfillCliOptions,
} from '../../../server/scripts/backfill-balance-atomic.ts';

test('balance atomic backfill defaults to dry run and requires confirmation to apply', () => {
  const dryRunOptions = parseBackfillCliOptions([], { NODE_ENV: 'development' });
  assert.equal(dryRunOptions.apply, false);
  assert.equal(dryRunOptions.confirmed, false);

  assert.throws(
    () => assertBackfillCanRun(parseBackfillCliOptions(['--apply'], { NODE_ENV: 'development' })),
    /requires --confirm-balance-atomic-backfill/,
  );

  assert.doesNotThrow(() => assertBackfillCanRun(parseBackfillCliOptions(
    ['--apply', '--confirm-balance-atomic-backfill'],
    { NODE_ENV: 'development' },
  )));
});

test('balance atomic backfill refuses production without explicit production flag', () => {
  assert.throws(
    () => assertBackfillCanRun(parseBackfillCliOptions([], { NODE_ENV: 'production' })),
    /refuses to run in production/,
  );

  assert.doesNotThrow(() => assertBackfillCanRun(parseBackfillCliOptions(
    ['--dry-run', '--allow-production'],
    { NODE_ENV: 'production' },
  )));
});

test('balance atomic backfill only fills missing atomic fields with conditional guards', () => {
  const id = new mongoose.Types.ObjectId();
  const operation = buildAtomicBackfillOperation({
    _id: id,
    userId: 'user-1',
    balanceRaw: '1000000',
    totalDepositedRaw: '2500000',
    totalWithdrawnRaw: '1500000',
    balanceAtomic: mongoose.Types.Decimal128.fromString('999999'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.ok(operation);
  assert.deepEqual(operation.updateOne.filter, {
    _id: id,
    totalDepositedAtomic: null,
    totalWithdrawnAtomic: null,
  });
  assert.deepEqual(Object.keys(operation.updateOne.update.$set ?? {}).sort(), [
    'totalDepositedAtomic',
    'totalWithdrawnAtomic',
    'updatedAt',
  ]);
  assert.equal('balanceAtomic' in (operation.updateOne.update.$set ?? {}), false);
});

test('balance atomic backfill treats null atomic fields as missing', () => {
  const id = new mongoose.Types.ObjectId();
  const operation = buildAtomicBackfillOperation({
    _id: id,
    userId: 'user-1',
    balanceRaw: '1000000',
    totalDepositedRaw: '2500000',
    totalWithdrawnRaw: '1500000',
    balanceAtomic: null as any,
    totalDepositedAtomic: mongoose.Types.Decimal128.fromString('2500000'),
    totalWithdrawnAtomic: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.ok(operation);
  assert.deepEqual(operation.updateOne.filter, {
    _id: id,
    balanceAtomic: null,
    totalWithdrawnAtomic: null,
  });
  assert.deepEqual(Object.keys(operation.updateOne.update.$set ?? {}).sort(), [
    'balanceAtomic',
    'totalWithdrawnAtomic',
    'updatedAt',
  ]);
});

test('balance atomic backfill is idempotent when all atomic fields already exist', () => {
  const operation = buildAtomicBackfillOperation({
    _id: new mongoose.Types.ObjectId(),
    userId: 'user-1',
    balanceRaw: '1000000',
    totalDepositedRaw: '2500000',
    totalWithdrawnRaw: '1500000',
    balanceAtomic: mongoose.Types.Decimal128.fromString('1000000'),
    totalDepositedAtomic: mongoose.Types.Decimal128.fromString('2500000'),
    totalWithdrawnAtomic: mongoose.Types.Decimal128.fromString('1500000'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(operation, null);
});
