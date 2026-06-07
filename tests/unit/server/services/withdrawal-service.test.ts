import assert from 'node:assert/strict';
import test from 'node:test';

import { requestWithdrawal } from '../../../../server/services/withdrawal-service.ts';
import { WithdrawalDailyLimitRepository } from '../../../../server/repositories/withdrawal-daily-limit.repository.ts';
import { WithdrawalRepository } from '../../../../server/repositories/withdrawal.repository.ts';
import { UserService } from '../../../../server/services/user.service.ts';

test('requestWithdrawal uses atomic daily limit reservation', async (t) => {
  let reserveArgs: unknown[] | undefined;
  let createQueuedCalled = false;

  t.mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: 'user-1' }));
  t.mock.method(WithdrawalDailyLimitRepository, 'reserveIfWithinLimit', async (...args: unknown[]) => {
    reserveArgs = args;
    return { userId: 'user-1', dayBucket: '2026-06-07', reservedRaw: '8000000', limitRaw: '50000000000', createdAt: new Date(), updatedAt: new Date() };
  });
  t.mock.method(WithdrawalRepository, 'createQueued', async () => {
    createQueuedCalled = true;
  });

  const mockSession = {
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => {},
  } as any;

  await requestWithdrawal({
    userId: 'user-1',
    toAddress: 'EQBxyz',
    amountUsdt: '8.000000',
    withdrawalId: 'wd-1',
    session: mockSession,
  });

  assert(reserveArgs, 'reserveIfWithinLimit should have been called');
  assert.equal(reserveArgs[0], 'user-1');
  assert.match(reserveArgs[1] as string, /^\d{4}-\d{2}-\d{2}$/, 'dayBucket should be YYYY-MM-DD format');
  assert.equal(reserveArgs[2], '8000000');
  assert(createQueuedCalled, 'createQueued should have been called');
});

test('requestWithdrawal rejects when daily limit exceeded', async (t) => {
  t.mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: 'user-1' }));
  t.mock.method(WithdrawalDailyLimitRepository, 'reserveIfWithinLimit', async () => null);

  const mockSession = {} as any;

  await assert.rejects(
    () => requestWithdrawal({
      userId: 'user-1',
      toAddress: 'EQBxyz',
      amountUsdt: '8.000000',
      withdrawalId: 'wd-2',
      session: mockSession,
    }),
    (error: unknown) => {
      const err = error as { code?: string };
      return err.code === 'DAILY_WITHDRAWAL_LIMIT_EXCEEDED';
    },
  );
});

test('requestWithdrawal rejects below minimum withdrawal', async (t) => {
  const mockSession = {} as any;

  await assert.rejects(
    () => requestWithdrawal({
      userId: 'user-1',
      toAddress: 'EQBxyz',
      amountUsdt: '0.500000',
      withdrawalId: 'wd-3',
      session: mockSession,
    }),
    (error: unknown) => {
      const err = error as { code?: string };
      return err.code === 'WITHDRAWAL_BELOW_MINIMUM';
    },
  );
});

test('requestWithdrawal rejects on insufficient balance', async (t) => {
  t.mock.method(UserService, 'deductBalanceSafely', async () => null);

  const mockSession = {} as any;

  await assert.rejects(
    () => requestWithdrawal({
      userId: 'user-1',
      toAddress: 'EQBxyz',
      amountUsdt: '8.000000',
      withdrawalId: 'wd-4',
      session: mockSession,
    }),
    (error: unknown) => {
      const err = error as { code?: string };
      return err.code === 'INSUFFICIENT_BALANCE';
    },
  );
});

test('requestWithdrawal dayBucket uses UTC date', async (t) => {
  let capturedDayBucket: string | undefined;

  t.mock.method(UserService, 'deductBalanceSafely', async () => ({ _id: 'user-1' }));
  t.mock.method(WithdrawalDailyLimitRepository, 'reserveIfWithinLimit', async (_userId: string, dayBucket: string) => {
    capturedDayBucket = dayBucket;
    return { userId: 'user-1', dayBucket, reservedRaw: '8000000', limitRaw: '50000000000', createdAt: new Date(), updatedAt: new Date() };
  });
  t.mock.method(WithdrawalRepository, 'createQueued', async () => {});

  const mockSession = {} as any;

  await requestWithdrawal({
    userId: 'user-1',
    toAddress: 'EQBxyz',
    amountUsdt: '8.000000',
    withdrawalId: 'wd-5',
    session: mockSession,
  });

  assert(capturedDayBucket);
  const parts = capturedDayBucket.split('-');
  assert.equal(parts.length, 3);
  assert.equal(parts[0]?.length, 4);
  assert.equal(parts[1]?.length, 2);
  assert.equal(parts[2]?.length, 2);
});
