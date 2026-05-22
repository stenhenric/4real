import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { Express } from 'express';
import mongoose from 'mongoose';

import { createApp } from '../app.ts';
import { getAuthCookieName } from '../config/cookies.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { applyPublicSharedCacheHeaders } from '../http/cache-policy.ts';
import type { BackgroundJobState } from '../services/background-jobs.service.ts';
import { resetBuildInfoForTests } from '../utils/build-info.ts';

const HEALTHY_BACKGROUND_JOBS: BackgroundJobState = {
  depositPoller: { enabled: true },
  orderProofRelay: { enabled: true },
  withdrawalWorker: { enabled: true },
  withdrawalConfirmation: { enabled: true },
  hotWalletMonitor: { enabled: true },
  staleMatchExpiry: { enabled: true },
};

async function withTestServer(
  run: (baseUrl: string) => Promise<void>,
  options: {
    backgroundJobs?: unknown;
    isShuttingDown?: () => boolean;
    probeRedis?: () => Promise<'up' | 'down' | 'disabled'>;
    probeBullmq?: () => Promise<'up' | 'down' | 'disabled'>;
    hotWalletRuntimeAvailable?: boolean;
    databaseReady?: boolean;
    env?: Record<string, string | undefined>;
    createGeneralRateLimiter?: () => (req: any, res: any, next: () => void) => void;
    createPublicCacheableGetRateLimiter?: () => (req: any, res: any, next: () => void) => void;
    registerPublicCacheableApiRoutes?: (
      app: Express,
      publicCacheableGetRateLimiter: (req: any, res: any, next: () => void) => void,
    ) => Promise<void> | void;
    registerApiRoutes?: (app: Express) => Promise<void> | void;
  } = {},
): Promise<void> {
  const previousDisableHmr = process.env.DISABLE_HMR;
  const previousEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(options.env ?? {})) {
    previousEnv.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  process.env.DISABLE_HMR = '1';
  resetEnvCacheForTests();
  resetBuildInfoForTests();
  const readyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', {
    configurable: true,
    get: () => (options.databaseReady ?? true) ? 1 : 0,
  });

  try {
    const app = await createApp({
      isShuttingDown: options.isShuttingDown ?? (() => false),
      getBackgroundJobs: () => options.backgroundJobs ?? HEALTHY_BACKGROUND_JOBS,
    }, {
      registerApiRoutes: options.registerApiRoutes ?? (() => undefined),
      registerPublicCacheableApiRoutes: options.registerPublicCacheableApiRoutes ?? (() => undefined),
      registerFrontendMiddleware: async () => undefined,
      createGeneralRateLimiter: options.createGeneralRateLimiter ?? (() => (_req, _res, next) => next()),
      createPublicCacheableGetRateLimiter:
        options.createPublicCacheableGetRateLimiter ?? (() => (_req, _res, next) => next()),
      probeRedis: options.probeRedis ?? (async () => 'disabled'),
      probeBullmq: options.probeBullmq ?? (async () => 'disabled'),
      getHotWalletRuntime: () => {
        if (options.hotWalletRuntimeAvailable === false) {
          throw new Error('hot wallet unavailable');
        }

        return {
          hotWalletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
          hotJettonWallet: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
          derivedHotJettonWallet: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        };
      },
    });
    const server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP test server address');
    }

    try {
      await run(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  } finally {
    if (previousDisableHmr === undefined) {
      delete process.env.DISABLE_HMR;
    } else {
      process.env.DISABLE_HMR = previousDisableHmr;
    }
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTests();
    resetBuildInfoForTests();
    if (readyStateDescriptor) {
      Object.defineProperty(mongoose.connection, 'readyState', readyStateDescriptor);
    }
  }
}

async function createTestApp(options: Parameters<typeof withTestServer>[1] = {}) {
  const previousEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(options.env ?? {})) {
    previousEnv.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnvCacheForTests();
  resetBuildInfoForTests();

  try {
    return await createApp({
      isShuttingDown: options.isShuttingDown ?? (() => false),
      getBackgroundJobs: () => options.backgroundJobs ?? HEALTHY_BACKGROUND_JOBS,
    }, {
      registerApiRoutes: () => undefined,
      registerPublicCacheableApiRoutes: options.registerPublicCacheableApiRoutes ?? (() => undefined),
      registerFrontendMiddleware: async () => undefined,
      createGeneralRateLimiter: options.createGeneralRateLimiter ?? (() => (_req, _res, next) => next()),
      createPublicCacheableGetRateLimiter:
        options.createPublicCacheableGetRateLimiter ?? (() => (_req, _res, next) => next()),
      probeRedis: options.probeRedis ?? (async () => 'disabled'),
      probeBullmq: options.probeBullmq ?? (async () => 'disabled'),
      getHotWalletRuntime: () => ({
        hotWalletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        hotJettonWallet: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        derivedHotJettonWallet: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      }),
    });
  } finally {
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTests();
    resetBuildInfoForTests();
  }
}

test('production app honors configured TRUST_PROXY instead of hardcoding one hop', async () => {
  const app = await createTestApp({
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '2',
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });

  assert.equal(app.get('trust proxy'), 2);
});

test('/api/health exposes build metadata and auth-session parity status', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json() as {
      status: string;
      build?: {
        gitSha?: string;
        builtAt?: string;
        startedAt?: string;
        authSessionFix?: {
          requiredGitSha?: string;
          isPresent?: boolean | null;
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(payload.status, 'ok');
    assert.equal(typeof payload.build?.gitSha, 'string');
    assert.equal(typeof payload.build?.builtAt, 'string');
    assert.equal(typeof payload.build?.startedAt, 'string');
    assert.equal(payload.build?.authSessionFix?.requiredGitSha, '5f35940');
    assert.equal(
      payload.build?.authSessionFix?.isPresent === null
        || typeof payload.build?.authSessionFix?.isPresent === 'boolean',
      true,
    );
  });
});

test('production health response does not expose build metadata', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json() as { status: string; build?: unknown };

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: 'ok' });
  }, {
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });
});

test('/api/health/live remains healthy while the process is alive', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/live`);
    const payload = await response.json() as { status: string };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(payload.status, 'ok');
  }, {
    backgroundJobs: {
      ...HEALTHY_BACKGROUND_JOBS,
      withdrawalWorker: {
        enabled: false,
        lastError: 'worker init failed',
      },
    },
  });
});

test('production liveness response is public but does not expose build metadata', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/live`);
    const payload = await response.json() as { status: string; build?: unknown };

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: 'ok' });
  }, {
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });
});

test('/api/health/ready is ready when required background jobs are healthy', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as {
      status: string;
      checks: {
        backgroundJobs: unknown;
        mandatoryBackgroundJobs: { status: string };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(payload.status, 'ready');
    assert.equal(payload.checks.mandatoryBackgroundJobs.status, 'up');
    assert.deepEqual(payload.checks.backgroundJobs, HEALTHY_BACKGROUND_JOBS);
  });
});

test('/api/health/ready probes Redis and BullMQ concurrently', async () => {
  let redisPending = false;
  let bullmqObservedRedisPending = false;

  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as { status: string };

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(bullmqObservedRedisPending, true);
  }, {
    probeRedis: async () => {
      redisPending = true;
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      redisPending = false;
      return 'up';
    },
    probeBullmq: async () => {
      bullmqObservedRedisPending = redisPending;
      return 'up';
    },
  });
});

test('/api/health/ready includes dependency timing details outside production', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as {
      status: string;
      dependencyTimingsMs?: {
        database?: number;
        redis?: number;
        bullmq?: number;
        hotWalletRuntime?: number;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(typeof payload.dependencyTimingsMs?.database, 'number');
    assert.equal(typeof payload.dependencyTimingsMs?.redis, 'number');
    assert.equal(typeof payload.dependencyTimingsMs?.bullmq, 'number');
    assert.equal(typeof payload.dependencyTimingsMs?.hotWalletRuntime, 'number');
  }, {
    probeRedis: async () => 'up',
    probeBullmq: async () => 'up',
  });
});

test('production readiness keeps Render-compatible status but redacts sensitive details', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as {
      status: string;
      checks?: {
        database?: string;
        redis?: string;
        bullmq?: string;
        shutdown?: string;
        hotWalletRuntime?: string;
        mandatoryBackgroundJobs?: { status: string };
        backgroundJobs?: unknown;
      };
      build?: unknown;
      uptimeSeconds?: number;
      dependencyTimingsMs?: unknown;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.checks?.mandatoryBackgroundJobs?.status, 'up');
    assert.equal(payload.checks?.backgroundJobs, undefined);
    assert.equal(payload.build, undefined);
    assert.equal(payload.uptimeSeconds, undefined);
    assert.equal(payload.dependencyTimingsMs, undefined);
  }, {
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });
});

test('/api/auth/me without an auth cookie bypasses the Redis-backed general limiter', async () => {
  let limiterCalls = 0;

  await withTestServer(async (baseUrl) => {
    const missingCookie = await fetch(`${baseUrl}/api/auth/me`);
    const missingCookiePayload = await missingCookie.json() as { code?: string };

    assert.equal(missingCookie.status, 401);
    assert.equal(missingCookiePayload.code, 'UNAUTHENTICATED');
    assert.equal(missingCookie.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(limiterCalls, 0);

    const cookieBearing = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        cookie: `${getAuthCookieName()}=present`,
      },
    });

    assert.equal(cookieBearing.status, 404);
    assert.equal(limiterCalls, 1);
  }, {
    createGeneralRateLimiter: () => (_req, _res, next) => {
      limiterCalls += 1;
      next();
    },
  });
});

test('public cacheable leaderboard bypasses the Redis-backed general limiter but still has a local limiter', async () => {
  let generalLimiterCalls = 0;
  let publicLimiterCalls = 0;

  await withTestServer(async (baseUrl) => {
    const publicResponse = await fetch(`${baseUrl}/api/users/leaderboard`);
    const publicPayload = await publicResponse.json() as { ok?: boolean };

    assert.equal(publicResponse.status, 200);
    assert.deepEqual(publicPayload, { ok: true });
    assert.equal(
      publicResponse.headers.get('cache-control'),
      'public, max-age=30, s-maxage=30, stale-while-revalidate=30, stale-if-error=60',
    );
    assert.equal(publicLimiterCalls, 1);
    assert.equal(generalLimiterCalls, 0);

    const privateResponse = await fetch(`${baseUrl}/api/cache-contract/private`);
    const privatePayload = await privateResponse.json() as { ok?: boolean };

    assert.equal(privateResponse.status, 200);
    assert.deepEqual(privatePayload, { ok: true });
    assert.equal(privateResponse.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(publicLimiterCalls, 1);
    assert.equal(generalLimiterCalls, 1);
  }, {
    createGeneralRateLimiter: () => (_req, _res, next) => {
      generalLimiterCalls += 1;
      next();
    },
    createPublicCacheableGetRateLimiter: () => (_req, _res, next) => {
      publicLimiterCalls += 1;
      next();
    },
    registerPublicCacheableApiRoutes: (app, publicCacheableGetRateLimiter) => {
      app.get('/api/users/leaderboard', publicCacheableGetRateLimiter, (_req, res) => {
        applyPublicSharedCacheHeaders(res, 30, {
          staleWhileRevalidateSeconds: 30,
          staleIfErrorSeconds: 60,
        });
        res.json({ ok: true });
      });
    },
    registerApiRoutes: (app) => {
      app.get('/api/cache-contract/private', (_req, res) => res.json({ ok: true }));
    },
  });
});

test('production metrics are unavailable unless a metrics token is configured', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/metrics`);

    assert.equal(response.status, 404);
  }, {
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      METRICS_TOKEN: undefined,
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });
});

test('production metrics require bearer token and run through explicit limiter', async () => {
  let limiterCalls = 0;
  await withTestServer(async (baseUrl) => {
    const missingToken = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(missingToken.status, 401);
    assert.equal(missingToken.headers.get('cache-control'), 'no-store, max-age=0');

    const validToken = await fetch(`${baseUrl}/api/metrics`, {
      headers: { Authorization: 'Bearer metrics-secret' },
    });
    assert.equal(validToken.status, 200);
    assert.equal(validToken.headers.get('cache-control'), 'no-store, max-age=0');
    assert.match(await validToken.text(), /^#/m);
    assert.equal(limiterCalls, 2);
  }, {
    env: {
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
      METRICS_TOKEN: 'metrics-secret',
      MONGODB_URI: 'mongodb+srv://example.invalid/4real',
      REDIS_URL: 'rediss://redis.example.invalid:6379',
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
    createGeneralRateLimiter: () => (_req, _res, next) => {
      limiterCalls += 1;
      next();
    },
  });
});

test('/tonconnect-manifest.json has an explicit short public cache policy', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tonconnect-manifest.json`);
    const payload = await response.json() as { url?: string; iconUrl?: string };

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'public, max-age=300, s-maxage=300, stale-while-revalidate=60, stale-if-error=300',
    );
    assert.match(response.headers.get('vary') ?? '', /(?:^|,\s*)Accept-Encoding(?:,|$)/);
    assert.equal(payload.url, 'https://app.example.com');
    assert.equal(payload.iconUrl, 'https://app.example.com/tonconnect-icon.jpg');
  }, {
    env: {
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
  });
});

test('API mutation responses inherit no-store from the API cache policy', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/cache-contract/mutation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://app.example.com',
      },
      body: JSON.stringify({ ok: true }),
    });
    const payload = await response.json() as { ok?: boolean };

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  }, {
    env: {
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
    registerApiRoutes: (app) => {
      app.post('/api/cache-contract/mutation', (_req, res) => {
        res.json({ ok: true });
      });
    },
  });
});

test('sensitive API route groups inherit no-store from the API cache policy', async () => {
  await withTestServer(async (baseUrl) => {
    const requests: Array<{ path: string; init?: RequestInit }> = [
      { path: '/api/auth/sessions' },
      { path: '/api/admin/merchant/dashboard' },
      { path: '/api/orders' },
      { path: '/api/transactions/withdrawals/wd-1' },
      {
        path: '/api/transactions/withdraw',
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://app.example.com',
          },
          body: JSON.stringify({ amount: '1.000000' }),
        },
      },
      {
        path: '/api/orders/order-1',
        init: {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            origin: 'https://app.example.com',
          },
          body: JSON.stringify({ status: 'DONE' }),
        },
      },
      {
        path: '/api/auth/sessions/session-1',
        init: {
          method: 'DELETE',
          headers: {
            origin: 'https://app.example.com',
          },
        },
      },
    ];

    for (const request of requests) {
      const response = await fetch(`${baseUrl}${request.path}`, request.init);
      const payload = await response.json() as { ok?: boolean };

      assert.equal(response.status, 200, `${request.init?.method ?? 'GET'} ${request.path}`);
      assert.deepEqual(payload, { ok: true }, request.path);
      assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0', request.path);
    }
  }, {
    env: {
      PUBLIC_APP_ORIGIN: 'https://app.example.com',
      ALLOWED_ORIGINS: 'https://app.example.com',
    },
    registerApiRoutes: (app) => {
      app.get('/api/auth/sessions', (_req, res) => res.json({ ok: true }));
      app.get('/api/admin/merchant/dashboard', (_req, res) => res.json({ ok: true }));
      app.get('/api/orders', (_req, res) => res.json({ ok: true }));
      app.get('/api/transactions/withdrawals/:withdrawalId', (_req, res) => res.json({ ok: true }));
      app.post('/api/transactions/withdraw', (_req, res) => res.json({ ok: true }));
      app.patch('/api/orders/:id', (_req, res) => res.json({ ok: true }));
      app.delete('/api/auth/sessions/:sessionId', (_req, res) => res.json({ ok: true }));
    },
  });
});

test('API not-found errors and dotfile probes are no-store', async () => {
  await withTestServer(async (baseUrl) => {
    const apiNotFound = await fetch(`${baseUrl}/api/cache-contract/not-found`);
    assert.equal(apiNotFound.status, 404);
    assert.equal(apiNotFound.headers.get('cache-control'), 'no-store, max-age=0');

    for (const path of ['/.env', '/nested/.git/config']) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0', path);
    }
  });
});

test('/api/health/ready is not ready when withdrawal worker initialization failed', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as {
      status: string;
      checks: {
        mandatoryBackgroundJobs: {
          status: string;
          failed: Array<{ key: string; lastError?: string }>;
        };
      };
    };

    assert.equal(response.status, 503);
    assert.equal(payload.status, 'not_ready');
    assert.equal(payload.checks.mandatoryBackgroundJobs.status, 'down');
    assert.deepEqual(payload.checks.mandatoryBackgroundJobs.failed, [
      {
        key: 'withdrawalWorker',
        enabled: false,
        lastError: 'worker init failed',
      },
    ]);
  }, {
    backgroundJobs: {
      ...HEALTHY_BACKGROUND_JOBS,
      withdrawalWorker: {
        enabled: false,
        lastError: 'worker init failed',
      },
    },
  });
});

test('/api/health/ready reflects recovery initialization failure through hot-wallet monitor state', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    const payload = await response.json() as {
      checks: {
        mandatoryBackgroundJobs: {
          status: string;
          failed: Array<{ key: string; lastError?: string }>;
        };
      };
    };

    assert.equal(response.status, 503);
    assert.equal(payload.checks.mandatoryBackgroundJobs.status, 'down');
    assert.deepEqual(payload.checks.mandatoryBackgroundJobs.failed, [
      {
        key: 'hotWalletMonitor',
        enabled: false,
        lastError: 'recovery failed',
      },
    ]);
  }, {
    backgroundJobs: {
      ...HEALTHY_BACKGROUND_JOBS,
      hotWalletMonitor: {
        enabled: false,
        lastError: 'recovery failed',
      },
    },
  });
});
