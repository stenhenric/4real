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
