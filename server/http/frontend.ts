import path from 'node:path';
import type { Express } from 'express';
import express from 'express';
import { createServer as createViteServer } from 'vite';

import { getEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

function registerStaticFrontend(app: Express): void {
  const distPath = path.join(process.cwd(), 'dist');

  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    fallthrough: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
      if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    },
  }));

  app.use(express.static(distPath, { index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
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
