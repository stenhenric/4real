import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';

import { getCorsOptions } from './config/cors.ts';
import { getEnv, getTrustProxySetting } from './config/env.ts';
import { csrfProtectionMiddleware } from './middleware/csrf.middleware.ts';
import { errorHandler, notFoundApiHandler } from './middleware/error.middleware.ts';
import { createGeneralRateLimiter } from './middleware/rate-limit.middleware.ts';
import { requestContextMiddleware } from './middleware/request-context.middleware.ts';
import { registerApiRoutes } from './routes/index.ts';
import { registerFrontendMiddleware } from './http/frontend.ts';

interface AppStatusProvider {
  isShuttingDown: () => boolean;
  getBackgroundJobs: () => unknown;
}

export async function createApp(statusProvider: AppStatusProvider) {
  const env = getEnv();
  const trustProxy = getTrustProxySetting();
  const app = express();

  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.disable('x-powered-by');
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

  app.get('/api/health/ready', (_req, res) => {
    const isReady = mongoose.connection.readyState === 1 && !statusProvider.isShuttingDown();
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks: {
        database: mongoose.connection.readyState === 1 ? 'up' : 'down',
        shuttingDown: statusProvider.isShuttingDown(),
        backgroundJobs: statusProvider.getBackgroundJobs(),
      },
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
