import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../app.ts';
import { resetEnvCacheForTests } from '../config/env.ts';
import { resetBuildInfoForTests } from '../utils/build-info.ts';

async function withTestServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previousDisableHmr = process.env.DISABLE_HMR;
  process.env.DISABLE_HMR = '1';
  resetEnvCacheForTests();
  resetBuildInfoForTests();

  try {
    const app = await createApp({
      isShuttingDown: () => false,
      getBackgroundJobs: () => ({ queue: 'idle' }),
    }, {
      registerApiRoutes: () => undefined,
      registerFrontendMiddleware: async () => undefined,
      createGeneralRateLimiter: () => (_req, _res, next) => next(),
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
    resetEnvCacheForTests();
    resetBuildInfoForTests();
  }
}

test('dotfile paths are blocked with 404s (/.env, /.git, encoded variants)', async () => {
  await withTestServer(async (baseUrl) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/.env`),
      fetch(`${baseUrl}/.env.example`),
      fetch(`${baseUrl}/.git/config`),
      fetch(`${baseUrl}/assets/.env`),
      fetch(`${baseUrl}/%2eenv`),
      fetch(`${baseUrl}/%2Egit/config`),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 404);
    }
  });
});

