import path from 'node:path';
import type { Express } from 'express';
import express from 'express';
import { createServer as createViteServer } from 'vite';

import { getEnv } from '../config/env.ts';
import {
  applyImmutableAssetCacheHeaders,
  applyNoStoreHeaders,
} from './cache-policy.ts';
import { logger } from '../utils/logger.ts';

const frontendRoutes = new Set([
  '/',
  '/privacy',
  '/terms',
  '/auth',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/magic-link',
  '/auth/approve-login',
  '/auth/verified',
  '/auth/mfa',
  '/auth/complete-profile',
  '/auth/security',
  '/play',
  '/leaderboard',
  '/bank',
  '/merchant',
  '/merchant/orders',
  '/merchant/deposits',
  '/merchant/liquidity',
  '/merchant/alerts',
]);

const probePathPatterns = [
  /(?:^|\/)_environment$/,
  /(?:^|\/)_profiler(?:\/|$)/,
  /(?:^|\/)(?:phpinfo|info|debug|pinfo|php|pi|p|test|phpversion|_phpinfo|old_phpinfo)(?:\.php)?(?:$|[.~])/,
  /(?:^|\/)(?:server-info|server-status)(?:\.php)?$/,
  /(?:^|\/)(?:wp-admin|administrator|cpanel|webmail|mail|smtp|hosting)(?:\/|$)/,
  /\.php(?:$|[.~])/,
];

function normalizeRequestPath(pathname: string): string {
  const decodedPath = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  const normalized = decodedPath.replace(/\\/g, '/').toLowerCase();

  if (normalized.length <= 1) {
    return '/';
  }

  return normalized.replace(/\/+$/, '');
}

function isProbePath(pathname: string): boolean {
  const normalizedPath = normalizeRequestPath(pathname);
  return probePathPatterns.some((pattern) => pattern.test(normalizedPath));
}

function isFrontendRoute(pathname: string): boolean {
  const normalizedPath = normalizeRequestPath(pathname);

  if (frontendRoutes.has(normalizedPath)) {
    return true;
  }

  return (
    /^\/game\/[a-z0-9_-]{1,64}$/.test(normalizedPath)
    || /^\/profile\/[a-z0-9_-]{1,64}$/.test(normalizedPath)
  );
}

function registerStaticFrontend(app: Express): void {
  const distPath = path.join(process.cwd(), 'dist');

  app.use((req, res, next) => {
    if (isProbePath(req.path)) {
      return res.status(404).send('Not found');
    }

    return next();
  });

  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    fallthrough: false,
    setHeaders: (res, filePath) => {
      applyImmutableAssetCacheHeaders(res);
      if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
      if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    },
  }));

  app.use(express.static(distPath, { index: false }));
  app.get('*', (req, res) => {
    if (!isFrontendRoute(req.path)) {
      return res.status(404).send('Not found');
    }

    applyNoStoreHeaders(res);
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

export async function registerFrontendMiddleware(app: Express): Promise<void> {
  const env = getEnv();

  if (env.NODE_ENV !== 'production' && !env.DISABLE_HMR) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });

      app.use(vite.middlewares);
      return;
    } catch (error) {
      logger.error('vite.initialization_failed', { error });
    }
  }

  registerStaticFrontend(app);
}
