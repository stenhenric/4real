import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import mongoose from 'mongoose';

import { User } from '../../../../server/models/User.ts';
import { UserBalanceRepository } from '../../../../server/repositories/user-balance.repository.ts';
import { UserService } from '../../../../server/services/user.service.ts';

function createSessionMock() {
  return {
    startTransaction() {},
    async commitTransaction() {},
    async abortTransaction() {},
    async endSession() {},
  };
}

function registerSessionCleanup(t: TestContext) {
  const startSessionMock = mock.method(mongoose, 'startSession', async () => createSessionMock() as any);
  t.after(() => startSessionMock.mock.restore());
}

test('UserService.createUser creates email/password users at 300 Elo by default', async (t) => {
  registerSessionCleanup(t);
  let savedUser: InstanceType<typeof User> | undefined;
  const saveMock = mock.method(User.prototype, 'save', async function save(this: InstanceType<typeof User>) {
    savedUser = this;
    return this;
  });
  const balanceMock = mock.method(UserBalanceRepository, 'ensureExists', async () => {});

  t.after(() => saveMock.mock.restore());
  t.after(() => balanceMock.mock.restore());

  const created = await UserService.createUser({
    email: 'fresh-email@example.test',
    passwordHash: 'hashed-password',
  });

  assert.equal(created.elo, 300);
  assert.equal(savedUser?.elo, 300);
});

test('UserService.createUser creates OAuth users at 300 Elo by default', async (t) => {
  registerSessionCleanup(t);
  let savedUser: InstanceType<typeof User> | undefined;
  const saveMock = mock.method(User.prototype, 'save', async function save(this: InstanceType<typeof User>) {
    savedUser = this;
    return this;
  });
  const balanceMock = mock.method(UserBalanceRepository, 'ensureExists', async () => {});

  t.after(() => saveMock.mock.restore());
  t.after(() => balanceMock.mock.restore());

  const created = await UserService.createUser({
    email: 'fresh-oauth@example.test',
    googleSubject: 'google-subject-1',
    emailVerifiedAt: new Date('2026-06-05T00:00:00.000Z'),
  });

  assert.equal(created.elo, 300);
  assert.equal(savedUser?.elo, 300);
});

test('system-created commission account does not default to 1000 Elo', async (t) => {
  let savedUser: InstanceType<typeof User> | undefined;
  const findMock = mock.method(User, 'findById', async () => null);
  const saveMock = mock.method(User.prototype, 'save', async function save(this: InstanceType<typeof User>) {
    savedUser = this;
    return this;
  });
  const balanceMock = mock.method(UserBalanceRepository, 'ensureExists', async () => {});

  t.after(() => findMock.mock.restore());
  t.after(() => saveMock.mock.restore());
  t.after(() => balanceMock.mock.restore());

  await UserService.ensureSystemCommissionAccountExists();

  assert.equal(savedUser?.elo, 300);
});

test('UserService.updateStatsAndElo applies Elo deltas atomically with a rating floor', async (t) => {
  const session = {} as mongoose.ClientSession;
  const findMock = mock.method(UserService, 'findById', async () => {
    throw new Error('atomic Elo updates should not pre-read the user');
  });
  let capturedUpdate: unknown;
  let capturedOptions: unknown;
  const updateMock = mock.method(User, 'findByIdAndUpdate', async (_id, update, options) => {
    capturedUpdate = update;
    capturedOptions = options;
    return { _id: 'player-atomic' } as any;
  });

  t.after(() => findMock.mock.restore());
  t.after(() => updateMock.mock.restore());

  const updated = await UserService.updateStatsAndElo('player-atomic', -20, 'loss', session);

  assert.ok(updated);
  assert.equal(Array.isArray(capturedUpdate), true);
  assert.deepEqual(capturedUpdate, [{
    $set: {
      elo: {
        $max: [
          0,
          { $add: [{ $ifNull: ['$elo', 300] }, -20] },
        ],
      },
      'stats.losses': { $add: [{ $ifNull: ['$stats.losses', 0] }, 1] },
    },
  }]);
  assert.deepEqual(capturedOptions, {
    returnDocument: 'after',
    session,
  });
});
