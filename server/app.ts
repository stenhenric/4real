import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Express, Request, RequestHandler } from 'express';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { getAuthCookieName } from './config/cookies.ts';
import { getCorsOptions } from './config/cors.ts';
import { getEnv, getPublicAppOrigin, getTrustProxySetting, type AppEnv } from './config/env.ts';
import {
  apiNoStoreMiddleware,
  applyNoStoreHeaders,
  applyPublicSharedCacheHeaders,
} from './http/cache-policy.ts';
import { getSecurityHelmetOptions } from './http/security-headers.ts';
import { csrfProtectionMiddleware } from './middleware/csrf.middleware.ts';
import { errorHandler, notFoundApiHandler } from './middleware/error.middleware.ts';
import {
  createGeneralRateLimiter,
  createPublicCacheableGetRateLimiter,
} from './middleware/rate-limit.middleware.ts';
import { requestContextMiddleware } from './middleware/request-context.middleware.ts';
import { recordReadinessDependency, renderMetrics } from './services/metrics.service.ts';
import { probeBullmq } from './services/bullmq-jobs.service.ts';
import type { BackgroundJobState, JobSnapshot } from './services/background-jobs.service.ts';
import { getHotWalletRuntime } from './services/hot-wallet-runtime.service.ts';
import { probeRedis } from './services/redis.service.ts';
import { getBuildInfo } from './utils/build-info.ts';
import type { PublicConfigDTO } from '../shared/types/api.ts';

interface AppStatusProvider {
  isShuttingDown: () => boolean;
  getBackgroundJobs: () => unknown;
}

interface AppDependencies {
  registerPublicCacheableApiRoutes: (app: Express, publicCacheableGetRateLimiter: RequestHandler) => Promise<void> | void;
  registerApiRoutes: (app: Express) => Promise<void> | void;
  registerFrontendMiddleware: (app: Express) => Promise<void>;
  createGeneralRateLimiter: () => RequestHandler;
  createPublicCacheableGetRateLimiter: () => RequestHandler;
  probeRedis: typeof probeRedis;
  probeBullmq: typeof probeBullmq;
  getHotWalletRuntime: typeof getHotWalletRuntime;
}

const defaultAppDependencies: AppDependencies = {
  registerPublicCacheableApiRoutes: async (app, publicCacheableGetRateLimiter) => {
    const { registerPublicCacheableApiRoutes } = await import('./routes/index.ts');
    return registerPublicCacheableApiRoutes(app, publicCacheableGetRateLimiter);
  },
  registerApiRoutes: async (app) => {
    const { registerApiRoutes } = await import('./routes/index.ts');
    return registerApiRoutes(app);
  },
  registerFrontendMiddleware: async (app) => {
    const { registerFrontendMiddleware } = await import('./http/frontend.ts');
    await registerFrontendMiddleware(app);
  },
  createGeneralRateLimiter,
  createPublicCacheableGetRateLimiter,
  probeRedis,
  probeBullmq,
  getHotWalletRuntime,
};

const MANDATORY_BACKGROUND_JOBS: Array<keyof BackgroundJobState> = [
  'depositPoller',
  'orderProofRelay',
  'withdrawalWorker',
  'withdrawalConfirmation',
  'hotWalletMonitor',
  'staleMatchExpiry',
];

function isBackgroundJobState(value: unknown): value is BackgroundJobState {
  return Boolean(
    value
      && typeof value === 'object'
      && MANDATORY_BACKGROUND_JOBS.every((key) => {
        const snapshot = (value as Record<string, unknown>)[key];
        return Boolean(snapshot && typeof snapshot === 'object' && 'enabled' in snapshot);
      }),
  );
}

function getMandatoryBackgroundJobReadiness(backgroundJobs: unknown): {
  status: 'up' | 'down';
  failed: Array<JobSnapshot & { key: keyof BackgroundJobState }>;
} {
  if (!isBackgroundJobState(backgroundJobs)) {
    return {
      status: 'down',
      failed: MANDATORY_BACKGROUND_JOBS.map((key) => ({
        key,
        enabled: false,
        lastError: 'Status unavailable',
      })),
    };
  }

  const failed = MANDATORY_BACKGROUND_JOBS.reduce<Array<JobSnapshot & { key: keyof BackgroundJobState }>>((entries, key) => {
    const snapshot = { key, ...backgroundJobs[key] };
    if (snapshot.enabled !== true || Boolean(snapshot.lastError)) {
      entries.push(snapshot);
    }

    return entries;
  }, []);

  return {
    status: failed.length === 0 ? 'up' : 'down',
    failed,
  };
}

function getBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function decodeRequestPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function isAllowedDevelopmentDotPath(pathname: string, env: AppEnv): boolean {
  if (env.NODE_ENV === 'production' || env.DISABLE_HMR) {
    return false;
  }

  return decodeRequestPath(pathname)
    .replace(/\\/g, '/')
    .toLowerCase()
    .startsWith('/node_modules/.vite/deps/');
}

function isBlockedDotPath(pathname: string, env: AppEnv): boolean {
  if (isAllowedDevelopmentDotPath(pathname, env)) {
    return false;
  }

  if (pathname.startsWith('/.')) {
    return true;
  }

  const decodedPath = decodeRequestPath(pathname);
  return decodedPath.includes('/.') || pathname.includes('/.');
}

function getReadinessResponse(params: {
  isReady: boolean;
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
    bullmq: 'up' | 'down' | 'disabled';
    shutdown: 'draining' | 'accepting';
    hotWalletRuntime: 'up' | 'down';
    backgroundJobs: unknown;
    mandatoryBackgroundJobs: ReturnType<typeof getMandatoryBackgroundJobReadiness>;
  };
  dependencyTimingsMs: Record<string, number>;
  production: boolean;
}) {
  const publicChecks = {
    database: params.checks.database,
    redis: params.checks.redis,
    bullmq: params.checks.bullmq,
    shutdown: params.checks.shutdown,
    hotWalletRuntime: params.checks.hotWalletRuntime,
    mandatoryBackgroundJobs: {
      status: params.checks.mandatoryBackgroundJobs.status,
    },
  };

  if (params.production) {
    return {
      status: params.isReady ? 'ready' : 'not_ready',
      checks: publicChecks,
    };
  }

  return {
    status: params.isReady ? 'ready' : 'not_ready',
    checks: params.checks,
    dependencyTimingsMs: params.dependencyTimingsMs,
    uptimeSeconds: Math.floor(process.uptime()),
    build: getBuildInfo(),
  };
}

function sendMissingAuthCookieResponse(req: Request, res: Parameters<RequestHandler>[1]) {
  const requestId = res.locals.requestId;
  res
    .status(401)
    .type('application/problem+json')
    .setHeader('cache-control', 'no-store, max-age=0')
    .json({
      type: 'urn:4real:problem:unauthenticated',
      title: 'Unauthorized',
      status: 401,
      detail: 'Access token required',
      code: 'UNAUTHENTICATED',
      message: 'Access token required',
      instance: req.originalUrl,
      ...(requestId ? { requestId } : {}),
    });
}

async function timeReadinessDependency<T>(
  dependency: string,
  operation: () => Promise<T> | T,
  getStatus: (result: T) => string,
): Promise<{ result: T; durationMs: number }> {
  const startedAt = performance.now();
  try {
    const result = await operation();
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    recordReadinessDependency({
      dependency,
      status: getStatus(result),
      durationMs,
    });
    return { result, durationMs };
  } catch (error) {
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    recordReadinessDependency({
      dependency,
      status: 'down',
      durationMs,
    });
    throw error;
  }
}

export async function createApp(
  statusProvider: AppStatusProvider,
  dependencyOverrides: Partial<AppDependencies> = {},
) {
  const env = getEnv();
  const trustProxy = getTrustProxySetting();
  const publicAppOrigin = getPublicAppOrigin();
  const appDependencies: AppDependencies = {
    ...defaultAppDependencies,
    ...dependencyOverrides,
  };
  const app = express();
  app.set('etag', 'strong');

  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.disable('x-powered-by');
  app.locals.statusProvider = statusProvider;

  app.use((req, res, next) => {
    if (isBlockedDotPath(req.path, env)) {
      applyNoStoreHeaders(res);
      return res.sendStatus(404);
    }

    return next();
  });

  app.use(requestContextMiddleware);
  app.use(helmet(getSecurityHelmetOptions(env)));
  app.use(cors(getCorsOptions()));
  app.use(compression());
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    applyNoStoreHeaders(res);
    res.json(env.NODE_ENV === 'production'
      ? { status: 'ok' }
      : {
          status: 'ok',
          build: getBuildInfo(),
        });
  });

  app.get('/api/health/live', (_req, res) => {
    applyNoStoreHeaders(res);
    res.json(env.NODE_ENV === 'production'
      ? { status: 'ok' }
      : {
          status: 'ok',
          build: getBuildInfo(),
        });
  });

  app.get('/api/health/ready', async (_req, res) => {
    applyNoStoreHeaders(res);
    const [redisProbe, bullmqProbe] = await Promise.all([
      timeReadinessDependency('redis', appDependencies.probeRedis, (result) => result),
      timeReadinessDependency('bullmq', appDependencies.probeBullmq, (result) => result),
    ]);
    const redis = redisProbe.result;
    const bullmq = bullmqProbe.result;
    const backgroundJobs = statusProvider.getBackgroundJobs();
    const mandatoryBackgroundJobs = getMandatoryBackgroundJobReadiness(backgroundJobs);
    const [databaseProbe, hotWalletRuntimeProbe] = await Promise.all([
      timeReadinessDependency('database', () => (
        mongoose.connection.readyState === 1 ? 'up' as const : 'down' as const
      ), (result) => result),
      timeReadinessDependency('hotWalletRuntime', () => {
        try {
          appDependencies.getHotWalletRuntime();
          return 'up' as const;
        } catch {
          return 'down' as const;
        }
      }, (result) => result),
    ]);
    const hotWalletRuntime = hotWalletRuntimeProbe.result;
    const checks = {
      database: databaseProbe.result,
      redis,
      bullmq,
      shutdown: statusProvider.isShuttingDown() ? 'draining' as const : 'accepting' as const,
      hotWalletRuntime,
      backgroundJobs,
      mandatoryBackgroundJobs,
    };
    const isReady = checks.database === 'up'
      && checks.shutdown === 'accepting'
      && (checks.redis === 'up' || checks.redis === 'disabled')
      && (checks.bullmq === 'up' || checks.bullmq === 'disabled')
      && checks.hotWalletRuntime === 'up'
      && checks.mandatoryBackgroundJobs.status === 'up';
    res.status(isReady ? 200 : 503).json(getReadinessResponse({
      isReady,
      checks,
      production: env.NODE_ENV === 'production',
      dependencyTimingsMs: {
        database: databaseProbe.durationMs,
        redis: redisProbe.durationMs,
        bullmq: bullmqProbe.durationMs,
        hotWalletRuntime: hotWalletRuntimeProbe.durationMs,
      },
    }));
  });

  app.get('/api/metrics', appDependencies.createGeneralRateLimiter(), async (req, res) => {
    applyNoStoreHeaders(res);
    if (env.NODE_ENV === 'production') {
      if (!env.METRICS_TOKEN) {
        return res.sendStatus(404);
      }

      if (getBearerToken(req) !== env.METRICS_TOKEN) {
        return res.sendStatus(401);
      }
    }

    res.type('text/plain; version=0.0.4').send(await renderMetrics());
  });

  app.get('/tonconnect-manifest.json', (_req, res) => {
    applyPublicSharedCacheHeaders(res, 300, {
      staleWhileRevalidateSeconds: 60,
      staleIfErrorSeconds: 300,
    });
    res.json({
      url: publicAppOrigin,
      name: '4real',
      iconUrl: `${publicAppOrigin}/tonconnect-icon.jpg`,
      privacyPolicyUrl: `${publicAppOrigin}/privacy-policy.html`,
      termsOfUseUrl: `${publicAppOrigin}/terms-of-use.html`,
    });
  });

  app.get('/api/auth/me', (req, res, next) => {
    if (req.cookies?.[getAuthCookieName()]) {
      return next();
    }

    return sendMissingAuthCookieResponse(req, res);
  });

  await appDependencies.registerPublicCacheableApiRoutes(
    app,
    appDependencies.createPublicCacheableGetRateLimiter(),
  );

  app.use('/api', appDependencies.createGeneralRateLimiter());
  app.use('/api', apiNoStoreMiddleware);
  app.use('/api', csrfProtectionMiddleware);

  app.get('/api/public-config', (_req, res) => {
    const payload: PublicConfigDTO = {
      telegram: {
        communityUrl: env.TELEGRAM_COMMUNITY_URL ?? null,
        supportUrl: env.TELEGRAM_SUPPORT_URL ?? null,
      },
    };

    res.json(payload);
  });

  await appDependencies.registerApiRoutes(app);
  app.use('/api', notFoundApiHandler);

  await appDependencies.registerFrontendMiddleware(app);
  app.use(errorHandler);

  return app;
}
