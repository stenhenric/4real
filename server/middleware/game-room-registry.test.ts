import assert from 'node:assert/strict';
import test from 'node:test';

import { GameRoomRegistry } from '../services/game-room-registry.service.ts';

test('GameRoomRegistry.runExclusive surfaces task errors without leaving an unhandled rejection behind', async (t) => {
  process.env.JWT_SECRET = 'x'.repeat(32);
  process.env.NODE_ENV = 'test';
  const registry = new GameRoomRegistry({
    waitingRoomTtlMs: 1_000,
    activeRoomTtlMs: 1_000,
    completedRoomTtlMs: 1_000,
    cleanupIntervalMs: 1_000,
  });

  let unhandledRejection: unknown;
  const handleUnhandledRejection = (reason: unknown) => {
    unhandledRejection = reason;
  };

  process.once('unhandledRejection', handleUnhandledRejection);
  t.after(() => {
    process.removeListener('unhandledRejection', handleUnhandledRejection);
  });

  await assert.rejects(
    registry.runExclusive('room-1', async () => {
      throw new Error('join failed');
    }),
    /join failed/,
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(unhandledRejection, undefined);
  assert.equal(
    await registry.runExclusive('room-1', async () => 'recovered'),
    'recovered',
  );
});
