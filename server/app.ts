import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { getCorsOptions } from './config/cors.ts';
import { getEnv, getPublicAppOrigin, getTrustProxySetting } from './config/env.ts';
import { csrfProtectionMiddleware } from './middleware/csrf.middleware.ts';
import { errorHandler, notFoundApiHandler } from './middleware/error.middleware.ts';
import { createGeneralRateLimiter } from './middleware/rate-limit.middleware.ts';
import { requestContextMiddleware } from './middleware/request-context.middleware.ts';
import { registerApiRoutes } from './routes/index.ts';
import { registerFrontendMiddleware } from './http/frontend.ts';
import { renderMetrics } from './services/metrics.service.ts';
import { probeBullmq } from './services/bullmq-jobs.service.ts';
import { getHotWalletRuntime } from './services/hot-wallet-runtime.service.ts';
import { probeRedis } from './services/redis.service.ts';

interface AppStatusProvider {
  isShuttingDown: () => boolean;
  getBackgroundJobs: () => unknown;
}

export async function createApp(statusProvider: AppStatusProvider) {
  const env = getEnv();
  const trustProxy = getTrustProxySetting();
  const publicAppOrigin = getPublicAppOrigin();
  const app = express();

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
    res.json({ status: 'ok' });
  });

  app.get('/api/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/ready', async (_req, res) => {
    const redis = await probeRedis();
    const bullmq = await probeBullmq();
    const hotWalletRuntime = (() => {
      try {
        getHotWalletRuntime();
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

  app.use('/api', createGeneralRateLimiter());
  app.use('/api', csrfProtectionMiddleware);
  registerApiRoutes(app);
  app.use('/api', notFoundApiHandler);

  await registerFrontendMiddleware(app);
  app.use(errorHandler);

  return app;
}
