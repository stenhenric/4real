import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LockUnavailableError,
  resetDistributedLockDependenciesForTests,
  setDistributedLockDependenciesForTests,
  withLock,
} from '../../../../server/services/distributed-lock.service.ts';

type LockState = {
  lockId: string;
  expiresAt: number;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createInMemoryLockDriver(now: () => number) {
  const locks = new Map<string, LockState>();
  let lockCounter = 0;

  return {
    acquire: async (resource: string, ttlMs: number): Promise<string | null> => {
      const current = now();
      const existing = locks.get(resource);
      if (existing && existing.expiresAt > current) {
        return null;
      }

      const lockId = `lock-${lockCounter += 1}`;
      locks.set(resource, {
        lockId,
        expiresAt: current + ttlMs,
      });
      return lockId;
    },
    renew: async (resource: string, lockId: string, ttlMs: number): Promise<boolean> => {
      const current = now();
      const existing = locks.get(resource);
      if (!existing || existing.lockId !== lockId || existing.expiresAt <= current) {
        return false;
      }

      locks.set(resource, {
        lockId,
        expiresAt: current + ttlMs,
      });
      return true;
    },
    release: async (resource: string, lockId: string): Promise<void> => {
      const existing = locks.get(resource);
      if (existing?.lockId === lockId) {
        locks.delete(resource);
      }
    },
    seed(resource: string, lockId: string, expiresAt: number): void {
      locks.set(resource, { lockId, expiresAt });
    },
  };
}

test('withLock allows only one concurrent caller per resource', async (t) => {
  const lockDriver = createInMemoryLockDriver(() => Date.now());
  resetDistributedLockDependenciesForTests();
  setDistributedLockDependenciesForTests({
    acquire: lockDriver.acquire,
    renew: lockDriver.renew,
    release: lockDriver.release,
    sleep: async () => {},
    random: () => 0,
    setIntervalFn: globalThis.setInterval,
    clearIntervalFn: globalThis.clearInterval,
  });
  t.after(() => resetDistributedLockDependenciesForTests());

  let releaseFirstLock: () => void = () => {
    throw new Error('first lock release callback was not initialized');
  };
  const firstLockHeld = new Promise<void>((resolve) => {
    releaseFirstLock = resolve;
  });
  let firstEntered = false;
  const firstCall = withLock('resource-concurrency', 1_000, async () => {
    firstEntered = true;
    await firstLockHeld;
  });

  while (!firstEntered) {
    await Promise.resolve();
  }

  let secondEntered = false;
  await assert.rejects(
    withLock('resource-concurrency', 1_000, async () => {
      secondEntered = true;
    }),
    (error: unknown) => error instanceof LockUnavailableError,
  );

  releaseFirstLock();
  await firstCall;

  assert.equal(secondEntered, false);
});

test('withLock acquires after an existing lock expires', async (t) => {
  const clock = { now: 0 };
  const lockDriver = createInMemoryLockDriver(() => clock.now);
  lockDriver.seed('resource-expiry', 'stale-lock', 25);

  resetDistributedLockDependenciesForTests();
  setDistributedLockDependenciesForTests({
    acquire: lockDriver.acquire,
    renew: lockDriver.renew,
    release: lockDriver.release,
    sleep: async () => {
      clock.now += 30;
    },
    random: () => 0,
    setIntervalFn: globalThis.setInterval,
    clearIntervalFn: globalThis.clearInterval,
  });
  t.after(() => resetDistributedLockDependenciesForTests());

  let executed = false;
  await withLock('resource-expiry', 20, async () => {
    executed = true;
  });

  assert.equal(executed, true);
});

test('withLock heartbeat renews lock during long operation', async (t) => {
  const clock = { now: 0 };
  const lockDriver = createInMemoryLockDriver(() => clock.now);
  const timerState: {
    heartbeat?: () => void;
    heartbeatCleared: boolean;
  } = {
    heartbeatCleared: false,
  };

  resetDistributedLockDependenciesForTests();
  setDistributedLockDependenciesForTests({
    acquire: lockDriver.acquire,
    renew: lockDriver.renew,
    release: lockDriver.release,
    sleep: async () => {},
    random: () => 0,
    setIntervalFn: ((callback: () => void, intervalMs?: number) => {
      assert.equal(intervalMs, 100);
      timerState.heartbeat = callback;
      return 1 as unknown as ReturnType<typeof globalThis.setInterval>;
    }) as typeof globalThis.setInterval,
    clearIntervalFn: (() => {
      timerState.heartbeatCleared = true;
    }) as typeof globalThis.clearInterval,
  });
  t.after(() => resetDistributedLockDependenciesForTests());

  let releaseLongRunning: () => void = () => {
    throw new Error('long-running lock release callback was not initialized');
  };
  const longRunningHeld = new Promise<void>((resolve) => {
    releaseLongRunning = resolve;
  });
  let longRunningEntered = false;
  const longRunning = withLock('resource-heartbeat', 200, async () => {
    longRunningEntered = true;
    await longRunningHeld;
  });

  try {
    while (!longRunningEntered || !timerState.heartbeat) {
      await Promise.resolve();
    }
    const runHeartbeat = timerState.heartbeat;
    if (!runHeartbeat) {
      throw new Error('heartbeat callback was not registered');
    }

    clock.now = 150;
    runHeartbeat();
    await Promise.resolve();
    await Promise.resolve();

    clock.now = 250;

    let secondEntered = false;
    await assert.rejects(
      withLock('resource-heartbeat', 200, async () => {
        secondEntered = true;
      }),
      (error: unknown) => error instanceof LockUnavailableError,
    );

    assert.equal(secondEntered, false);
  } finally {
    releaseLongRunning();
    await longRunning;
  }
  assert.equal(timerState.heartbeatCleared, true);
});

test('withLock releases lock when callback throws', async (t) => {
  const lockDriver = createInMemoryLockDriver(() => Date.now());
  resetDistributedLockDependenciesForTests();
  setDistributedLockDependenciesForTests({
    acquire: lockDriver.acquire,
    renew: lockDriver.renew,
    release: lockDriver.release,
    sleep: async () => {},
    random: () => 0,
    setIntervalFn: globalThis.setInterval,
    clearIntervalFn: globalThis.clearInterval,
  });
  t.after(() => resetDistributedLockDependenciesForTests());

  await assert.rejects(
    withLock('resource-finally', 1_000, async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  let reacquired = false;
  await withLock('resource-finally', 1_000, async () => {
    reacquired = true;
  });

  assert.equal(reacquired, true);
});
