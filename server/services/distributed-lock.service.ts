import { randomUUID } from 'node:crypto';

import { DistributedLockRepository } from '../repositories/distributed-lock.repository.ts';
import { logger } from '../utils/logger.ts';

const LOCK_ACQUIRE_MAX_RETRIES = 3;
const LOCK_ACQUIRE_JITTER_MS = 500;
const LOCK_HOLDER_PREFIX = `${process.pid}:${randomUUID()}`;

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

export class LockUnavailableError extends Error {
  readonly resource: string;

  constructor(resource: string) {
    super(`Failed to acquire lock for resource "${resource}"`);
    this.name = 'LockUnavailableError';
    this.resource = resource;
  }
}

export class DistributedLockService {
  static async acquire(resource: string, ttlMs: number): Promise<string | null> {
    const lockId = `${LOCK_HOLDER_PREFIX}:${randomUUID()}`;
    const acquired = await DistributedLockRepository.acquire(resource, lockId, ttlMs);
    return acquired ? lockId : null;
  }

  static async renew(resource: string, lockId: string, ttlMs: number): Promise<boolean> {
    return DistributedLockRepository.renew(resource, lockId, ttlMs);
  }

  static async release(resource: string, lockId: string): Promise<void> {
    await DistributedLockRepository.release(resource, lockId);
  }
}

type WithLockDependencies = {
  acquire: (resource: string, ttlMs: number) => Promise<string | null>;
  renew: (resource: string, lockId: string, ttlMs: number) => Promise<boolean>;
  release: (resource: string, lockId: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  setIntervalFn: typeof globalThis.setInterval;
  clearIntervalFn: typeof globalThis.clearInterval;
};

const defaultWithLockDependencies: WithLockDependencies = {
  acquire: (resource, ttlMs) => DistributedLockService.acquire(resource, ttlMs),
  renew: (resource, lockId, ttlMs) => DistributedLockService.renew(resource, lockId, ttlMs),
  release: (resource, lockId) => DistributedLockService.release(resource, lockId),
  sleep,
  random: Math.random,
  setIntervalFn: globalThis.setInterval,
  clearIntervalFn: globalThis.clearInterval,
};

const withLockDependencies: WithLockDependencies = {
  ...defaultWithLockDependencies,
};

function getRetryDelayMs(random: () => number): number {
  return Math.floor(random() * LOCK_ACQUIRE_JITTER_MS);
}

function unrefTimerIfSupported(handle: ReturnType<typeof globalThis.setInterval>): void {
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
    (handle as { unref?: () => void }).unref?.();
  }
}

async function renewLockHeartbeat(resource: string, lockId: string, ttlMs: number): Promise<void> {
  try {
    const renewed = await withLockDependencies.renew(resource, lockId, ttlMs);
    if (!renewed) {
      logger.warn('distributed_lock.renew_lost', { resource, lockId });
    }
  } catch (error) {
    logger.error('distributed_lock.renew_failed', {
      resource,
      lockId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function withLock<T>(
  resource: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lockId: string | null = null;

  for (let attempt = 0; attempt <= LOCK_ACQUIRE_MAX_RETRIES; attempt += 1) {
    lockId = await withLockDependencies.acquire(resource, ttlMs);
    if (lockId) {
      break;
    }

    if (attempt === LOCK_ACQUIRE_MAX_RETRIES) {
      throw new LockUnavailableError(resource);
    }

    await withLockDependencies.sleep(getRetryDelayMs(withLockDependencies.random));
  }

  if (!lockId) {
    throw new LockUnavailableError(resource);
  }

  const heartbeatMs = Math.max(1, Math.floor(ttlMs / 2));
  const heartbeatHandle = withLockDependencies.setIntervalFn(() => {
    void renewLockHeartbeat(resource, lockId, ttlMs);
  }, heartbeatMs);
  unrefTimerIfSupported(heartbeatHandle);

  try {
    return await fn();
  } finally {
    withLockDependencies.clearIntervalFn(heartbeatHandle);
    await withLockDependencies.release(resource, lockId);
  }
}

export function resetDistributedLockDependenciesForTests(): void {
  Object.assign(withLockDependencies, defaultWithLockDependencies);
}

export function setDistributedLockDependenciesForTests(overrides: Partial<WithLockDependencies>): void {
  Object.assign(withLockDependencies, overrides);
}
