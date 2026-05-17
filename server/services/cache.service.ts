import { getEnv } from '../config/env.ts';
import { recordCacheEvent } from './metrics.service.ts';
import { logger } from '../utils/logger.ts';

export const CACHE_TTLS = {
  leaderboard: 30,
  activeMatches: 5,
  merchantConfig: 60,
  merchantDashboard: 5,
  merchantBalanceSnapshot: 30,
  jettonWallet: 24 * 60 * 60,
} as const;

const CACHE_NAMESPACE_VERSIONS = {
  leaderboard: 1,
  activeMatches: 1,
  merchantConfig: 1,
  merchantDashboard: 1,
  merchantBalanceSnapshot: 1,
  jettonWallet: 1,
} as const;

type CacheNamespace = keyof typeof CACHE_NAMESPACE_VERSIONS;
type CacheKeyPart = string | number | null | undefined;

const inflightLoads = new Map<string, Promise<unknown>>();
const localCache = new Map<string, { value: string; expiresAtMs: number }>();

async function getCacheRedisClient() {
  const { getRedisClient } = await import('./redis.service.ts');
  return getRedisClient();
}

function shouldUseMemoryOnlyCache(): boolean {
  const env = getEnv();
  return env.NODE_ENV === 'test' || !env.REDIS_URL;
}

function normalizeKeyPart(part: CacheKeyPart): string {
  if (part === null || part === undefined) {
    return 'null';
  }

  return encodeURIComponent(String(part));
}

function buildCacheKey(namespace: CacheNamespace, ...parts: CacheKeyPart[]): string {
  const version = CACHE_NAMESPACE_VERSIONS[namespace];
  const normalizedParts = parts.map((part) => normalizeKeyPart(part));
  return ['4real', 'cache', namespace, `v${version}`, ...normalizedParts].join(':');
}

function getCacheNamespace(key: string): string {
  const [, cachePrefix, namespace] = key.split(':');
  return cachePrefix === 'cache' && namespace ? namespace : 'unknown';
}

export const CacheKeys = {
  leaderboard(limit: number) {
    return buildCacheKey('leaderboard', 'top', limit);
  },
  activeMatches() {
    return buildCacheKey('activeMatches', 'public');
  },
  merchantConfig() {
    return buildCacheKey('merchantConfig', 'default');
  },
  merchantDashboard() {
    return buildCacheKey('merchantDashboard', 'summary');
  },
  merchantBalanceSnapshot(ownerAddress: string) {
    return buildCacheKey('merchantBalanceSnapshot', ownerAddress);
  },
  jettonWallet(ownerAddress: string | null, jettonMaster: string | null) {
    return buildCacheKey('jettonWallet', ownerAddress, jettonMaster);
  },
} as const;

export function computeJitteredTtl(ttlSeconds: number): number {
  const jitterWindow = Math.max(0, Math.floor(ttlSeconds * 0.1));
  const jitter = Math.floor(Math.random() * (jitterWindow + 1));
  return Math.max(1, ttlSeconds - jitter);
}

async function readCachedString(key: string): Promise<string | null> {
  const localEntry = localCache.get(key);
  if (localEntry) {
    if (localEntry.expiresAtMs > Date.now()) {
      return localEntry.value;
    }

    localCache.delete(key);
  }

  if (shouldUseMemoryOnlyCache()) {
    return null;
  }

  try {
    return await (await getCacheRedisClient()).get(key);
  } catch (error) {
    recordCacheEvent({ event: 'read_failed', namespace: getCacheNamespace(key) });
    logger.warn('cache.read_failed', { key, error });
    return null;
  }
}

async function writeCachedString(key: string, value: string, ttlSeconds: number): Promise<void> {
  const jitteredTtl = computeJitteredTtl(ttlSeconds);
  localCache.set(key, {
    value,
    expiresAtMs: Date.now() + (jitteredTtl * 1000),
  });
  recordCacheEvent({ event: 'write', namespace: getCacheNamespace(key) });

  if (shouldUseMemoryOnlyCache()) {
    return;
  }

  try {
    await (await getCacheRedisClient()).set(key, value, 'EX', jitteredTtl);
  } catch (error) {
    recordCacheEvent({ event: 'write_failed', namespace: getCacheNamespace(key) });
    logger.warn('cache.write_failed', { key, error });
  }
}

export async function invalidateCacheKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  for (const key of keys) {
    localCache.delete(key);
    recordCacheEvent({ event: 'invalidate', namespace: getCacheNamespace(key) });
  }

  if (shouldUseMemoryOnlyCache()) {
    return;
  }

  try {
    await (await getCacheRedisClient()).del(...keys);
  } catch (error) {
    for (const key of keys) {
      recordCacheEvent({ event: 'invalidate_failed', namespace: getCacheNamespace(key) });
    }
    logger.warn('cache.invalidate_failed', { keys, error });
  }
}

export async function getOrPopulateJson<T>(params: {
  key: string;
  ttlSeconds: number;
  loader: () => Promise<T>;
}): Promise<{ value: T; cacheStatus: 'hit' | 'miss' }> {
  const cached = await readCachedString(params.key);
  if (cached !== null) {
    try {
      recordCacheEvent({ event: 'hit', namespace: getCacheNamespace(params.key) });
      return {
        value: JSON.parse(cached) as T,
        cacheStatus: 'hit',
      };
    } catch (error) {
      await invalidateCacheKeys([params.key]);
      logger.warn('cache.decode_failed', { key: params.key, error });
    }
  }
  recordCacheEvent({ event: 'miss', namespace: getCacheNamespace(params.key) });

  const existingLoad = inflightLoads.get(params.key) as Promise<{ value: T; cacheStatus: 'miss' }> | undefined;
  if (existingLoad) {
    recordCacheEvent({ event: 'coalesced', namespace: getCacheNamespace(params.key) });
    return existingLoad;
  }

  const nextLoad = (async () => {
    let value: T;
    try {
      value = await params.loader();
    } catch (error) {
      recordCacheEvent({ event: 'loader_failed', namespace: getCacheNamespace(params.key) });
      throw error;
    }
    await writeCachedString(params.key, JSON.stringify(value), params.ttlSeconds);
    return {
      value,
      cacheStatus: 'miss' as const,
    };
  })();

  inflightLoads.set(params.key, nextLoad);

  try {
    return await nextLoad;
  } finally {
    inflightLoads.delete(params.key);
  }
}

export function resetCacheServiceForTests(): void {
  localCache.clear();
  inflightLoads.clear();
}
