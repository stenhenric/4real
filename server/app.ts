import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { Express, RequestHandler } from 'express';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { getCorsOptions } from './config/cors.ts';
import { getEnv, getPublicAppOrigin, getTrustProxySetting } from './config/env.ts';
import { apiNoStoreMiddleware } from './http/cache-policy.ts';
import { csrfProtectionMiddleware } from './middleware/csrf.middleware.ts';
import { errorHandler, notFoundApiHandler } from './middleware/error.middleware.ts';
import { createGeneralRateLimiter } from './middleware/rate-limit.middleware.ts';
import { requestContextMiddleware } from './middleware/request-context.middleware.ts';
import { renderMetrics } from './services/metrics.service.ts';
import { probeBullmq } from './services/bullmq-jobs.service.ts';
import { getHotWalletRuntime } from './services/hot-wallet-runtime.service.ts';
import { probeRedis } from './services/redis.service.ts';
import { getBuildInfo } from './utils/build-info.ts';

interface AppStatusProvider {
  isShuttingDown: () => boolean;
  getBackgroundJobs: () => unknown;
}

interface AppDependencies {
  registerApiRoutes: (app: Express) => Promise<void> | void;
  registerFrontendMiddleware: (app: Express) => Promise<void>;
  createGeneralRateLimiter: () => RequestHandler;
  probeRedis: typeof probeRedis;
  probeBullmq: typeof probeBullmq;
  getHotWalletRuntime: typeof getHotWalletRuntime;
}

const defaultAppDependencies: AppDependencies = {
  registerApiRoutes: async (app) => {
    const { registerApiRoutes } = await import('./routes/index.ts');
    registerApiRoutes(app);
  },
  registerFrontendMiddleware: async (app) => {
    const { registerFrontendMiddleware } = await import('./http/frontend.ts');
    await registerFrontendMiddleware(app);
  },
  createGeneralRateLimiter,
  probeRedis,
  probeBullmq,
  getHotWalletRuntime,
};

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

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  } else if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.disable('x-powered-by');
  app.locals.statusProvider = statusProvider;
  app.use(requestContextMiddleware);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors(getCorsOptions()));
  app.use(compression());
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      build: getBuildInfo(),
    });
  });

  app.get('/api/health/live', (_req, res) => {
    res.json({
      status: 'ok',
      build: getBuildInfo(),
    });
  });

  app.get('/api/health/ready', async (_req, res) => {
    const redis = await appDependencies.probeRedis();
    const bullmq = await appDependencies.probeBullmq();
    const hotWalletRuntime = (() => {
      try {
        appDependencies.getHotWalletRuntime();
        return 'up' as const;
      } catch {
        return 'down' as const;
      }
    })();
    const checks = {
      database: mongoose.connection.readyState === 1 ? 'up' : 'down',
      redis,
      bullmq,
      shutdown: statusProvider.isShuttingDown() ? 'draining' : 'accepting',
      hotWalletRuntime,
      backgroundJobs: statusProvider.getBackgroundJobs(),
    };
    const isReady = checks.database === 'up'
      && checks.shutdown === 'accepting'
      && (checks.redis === 'up' || checks.redis === 'disabled')
      && (checks.bullmq === 'up' || checks.bullmq === 'disabled')
      && checks.hotWalletRuntime === 'up';
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks,
      uptimeSeconds: Math.floor(process.uptime()),
      build: getBuildInfo(),
    });
  });

  app.get('/api/metrics', async (_req, res) => {
    res.type('text/plain; version=0.0.4').send(await renderMetrics());
  });

  app.get('/tonconnect-manifest.json', (_req, res) => {
    res.json({
      url: publicAppOrigin,
      name: '4real',
      iconUrl: `${publicAppOrigin}/tonconnect-icon.svg`,
      privacyPolicyUrl: `${publicAppOrigin}/privacy-policy.html`,
      termsOfUseUrl: `${publicAppOrigin}/terms-of-use.html`,
    });
  });

  app.use('/api', appDependencies.createGeneralRateLimiter());
  app.use('/api', apiNoStoreMiddleware);
  app.use('/api', csrfProtectionMiddleware);
  await appDependencies.registerApiRoutes(app);
  app.use('/api', notFoundApiHandler);

  await appDependencies.registerFrontendMiddleware(app);
  app.use(errorHandler);

  return app;
}
