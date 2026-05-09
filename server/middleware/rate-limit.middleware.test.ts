import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import express from 'express';

import { resetEnvCacheForTests } from '../config/env.ts';
import { setRedisClientForTests } from '../services/redis.service.ts';
import { createAuthRateLimiter, createGeneralRateLimiter } from './rate-limit.middleware.ts';

function withRedisRateLimitEnv(t: TestContext): void {
  const previous = {
    REDIS_URL: process.env.REDIS_URL,
    GENERAL_RATE_LIMIT_WINDOW_MS: process.env.GENERAL_RATE_LIMIT_WINDOW_MS,
    GENERAL_RATE_LIMIT_MAX: process.env.GENERAL_RATE_LIMIT_MAX,
    AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  };

  process.env.REDIS_URL = 'redis://rate-limit-test';
  process.env.GENERAL_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.GENERAL_RATE_LIMIT_MAX = '100';
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.AUTH_RATE_LIMIT_MAX = '100';
  resetEnvCacheForTests();

  t.after(() => {
    setRedisClientForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTests();
  });
}

function createRedisDouble() {
  const counts = new Map<string, number>();

  return {
    async call(command: string, ...args: string[]) {
      if (command === 'SCRIPT' && args[0] === 'LOAD') {
        return `sha:${args[1]?.length ?? 0}`;
      }

      if (command === 'EVALSHA') {
        const key = args[2] ?? 'missing-key';
        const nextCount = (counts.get(key) ?? 0) + 1;
        counts.set(key, nextCount);
        return [nextCount, 60_000];
      }

      if (command === 'DECR') {
        const key = args[0] ?? 'missing-key';
        counts.set(key, Math.max((counts.get(key) ?? 1) - 1, 0));
        return counts.get(key) ?? 0;
      }

      if (command === 'DEL') {
        counts.delete(args[0] ?? 'missing-key');
        return 1;
      }

      throw new Error(`Unexpected Redis command: ${command}`);
    },
  };
}

test('Redis-backed general and auth rate limiters do not double-count one auth request', async (t) => {
  withRedisRateLimitEnv(t);
  setRedisClientForTests(createRedisDouble() as any);
  const consoleErrorMock = t.mock.method(console, 'error', () => undefined);

  const app = express();
  app.set('trust proxy', 1);
  app.use('/api', createGeneralRateLimiter());
  app.post('/api/auth/register', createAuthRateLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/register`, {
    method: 'POST',
    headers: {
      'X-Forwarded-For': '10.31.43.131',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(
    consoleErrorMock.mock.calls.some((call) => call.arguments.some((argument) => (
      argument instanceof Error && 'code' in argument && argument.code === 'ERR_ERL_DOUBLE_COUNT'
    ))),
    false,
  );
});
