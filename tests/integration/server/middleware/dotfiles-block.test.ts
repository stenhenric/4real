import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../../../server/app.ts';
import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { resetBuildInfoForTests } from '../../../../server/utils/build-info.ts';

async function withTestServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDisableHmr = process.env.DISABLE_HMR;
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_HMR = '1';
  resetEnvCacheForTests();
  resetBuildInfoForTests();

  try {
    const app = await createApp({
      isShuttingDown: () => false,
      getBackgroundJobs: () => ({ queue: 'idle' }),
    }, {
      registerPublicCacheableApiRoutes: () => undefined,
      registerApiRoutes: () => undefined,
      registerFrontendMiddleware: async () => undefined,
      createGeneralRateLimiter: () => (_req, _res, next) => next(),
      createPublicCacheableGetRateLimiter: () => (_req, _res, next) => next(),
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
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousDisableHmr === undefined) {
      delete process.env.DISABLE_HMR;
    } else {
      process.env.DISABLE_HMR = previousDisableHmr;
    }
    resetEnvCacheForTests();
    resetBuildInfoForTests();
  }
}

async function withDevelopmentFrontendServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDisableHmr = process.env.DISABLE_HMR;
  process.env.NODE_ENV = 'development';
  delete process.env.DISABLE_HMR;
  resetEnvCacheForTests();
  resetBuildInfoForTests();

  try {
    const app = await createApp({
      isShuttingDown: () => false,
      getBackgroundJobs: () => ({ queue: 'idle' }),
    }, {
      registerPublicCacheableApiRoutes: () => undefined,
      registerApiRoutes: () => undefined,
      registerFrontendMiddleware: async (app) => {
        app.use((_req, res) => res.sendStatus(204));
      },
      createGeneralRateLimiter: () => (_req, _res, next) => next(),
      createPublicCacheableGetRateLimiter: () => (_req, _res, next) => next(),
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
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousDisableHmr === undefined) {
      delete process.env.DISABLE_HMR;
    } else {
      process.env.DISABLE_HMR = previousDisableHmr;
    }
    resetEnvCacheForTests();
    resetBuildInfoForTests();
  }
}

test('dotfile paths are blocked with 404s (/.env, /.git, encoded variants)', async () => {
  await withTestServer(async (baseUrl) => {
    const requests = [
      '/.env',
      '/.env.example',
      '/.git/config',
      '/assets/.env',
      '/%2eenv',
      '/%2Egit/config',
    ];

    for (const pathname of requests) {
      const response = await fetch(`${baseUrl}${pathname}`);
      await response.text();

      assert.equal(response.status, 404);
    }
  });
});

test('development Vite optimized dependency paths are not blocked as dotfiles', async () => {
  await withDevelopmentFrontendServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/node_modules/.vite/deps/react.js?v=test`);
    await response.text();

    assert.equal(response.status, 204);
  });
});

