import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import express from 'express';

import { resetEnvCacheForTests } from '../config/env.ts';
import { setRedisClientForTests } from '../services/redis.service.ts';
import {
  createAuthRateLimiter,
  createGeneralRateLimiter,
  createPasswordLoginIdentifierRateLimiter,
  createPublicCacheableGetRateLimiter,
} from './rate-limit.middleware.ts';

function withRedisRateLimitEnv(t: TestContext): void {
  const previous = {
    REDIS_URL: process.env.REDIS_URL,
    GENERAL_RATE_LIMIT_WINDOW_MS: process.env.GENERAL_RATE_LIMIT_WINDOW_MS,
    GENERAL_RATE_LIMIT_MAX: process.env.GENERAL_RATE_LIMIT_MAX,
    PUBLIC_CACHEABLE_GET_RATE_LIMIT_WINDOW_MS: process.env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_WINDOW_MS,
    PUBLIC_CACHEABLE_GET_RATE_LIMIT_MAX: process.env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_MAX,
    AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  };

  process.env.REDIS_URL = 'redis://rate-limit-test';
  process.env.GENERAL_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.GENERAL_RATE_LIMIT_MAX = '100';
  process.env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_MAX = '100';
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

function withAuthRateLimitEnv(t: TestContext, max = '2'): void {
  const previous = {
    REDIS_URL: process.env.REDIS_URL,
    AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  };

  delete process.env.REDIS_URL;
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.AUTH_RATE_LIMIT_MAX = max;
  resetEnvCacheForTests();

  t.after(() => {
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

async function startLoginRateLimitApp(t: TestContext, handler: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post(
    '/api/auth/login/password',
    createAuthRateLimiter(),
    createPasswordLoginIdentifierRateLimiter(),
    handler,
  );

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

function loginRequest(baseUrl: string, params: {
  identifier: string;
  password?: string;
  ip?: string;
}) {
  return fetch(`${baseUrl}/api/auth/login/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.ip ? { 'X-Forwarded-For': params.ip } : {}),
    },
    body: JSON.stringify({
      identifier: params.identifier,
      password: params.password ?? 'wrong-password',
    }),
  });
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

test('public cacheable GET limiter uses its dedicated lightweight budget', async (t) => {
  withRedisRateLimitEnv(t);
  process.env.PUBLIC_CACHEABLE_GET_RATE_LIMIT_MAX = '1';
  resetEnvCacheForTests();

  const app = express();
  app.set('trust proxy', 1);
  app.get('/api/users/leaderboard', createPublicCacheableGetRateLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${baseUrl}/api/users/leaderboard`)).status, 200);

  const limited = await fetch(`${baseUrl}/api/users/leaderboard`);

  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later.',
  });
});

test('password login limiter blocks repeated failures for one normalized identifier', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startLoginRateLimitApp(t, (_req, res) => {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  assert.equal((await loginRequest(baseUrl, { identifier: 'Alice@Example.com', ip: '10.0.0.1' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.0.2' })).status, 401);
  const limited = await loginRequest(baseUrl, { identifier: '  ALICE@example.com  ', ip: '10.0.0.3' });

  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many authentication attempts, please try again later.',
  });
});

test('password login identifier limiter does not block different identifiers', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startLoginRateLimitApp(t, (_req, res) => {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.1.1' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.1.2' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'bob@example.com', ip: '10.0.1.3' })).status, 401);
});

test('password login keeps the IP auth limiter in front of identifier throttling', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startLoginRateLimitApp(t, (_req, res) => {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.2.1' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'bob@example.com', ip: '10.0.2.1' })).status, 401);
  const limited = await loginRequest(baseUrl, { identifier: 'carol@example.com', ip: '10.0.2.1' });

  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many authentication attempts, please try again later.',
  });
});

test('password login identifier limiter does not count successful logins', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startLoginRateLimitApp(t, (req, res) => {
    if (req.body?.password === 'correct-password') {
      res.status(200).json({ status: 'authenticated' });
      return;
    }

    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', password: 'correct-password', ip: '10.0.3.1' })).status, 200);
  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.3.2' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'alice@example.com', ip: '10.0.3.3' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'bob@example.com', password: 'correct-password', ip: '10.0.3.4' })).status, 200);
});

test('password login limited responses are generic for existing and absent identifiers', async (t) => {
  withAuthRateLimitEnv(t, '1');
  const baseUrl = await startLoginRateLimitApp(t, (_req, res) => {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  assert.equal((await loginRequest(baseUrl, { identifier: 'existing@example.com', ip: '10.0.4.1' })).status, 401);
  assert.equal((await loginRequest(baseUrl, { identifier: 'absent@example.com', ip: '10.0.4.2' })).status, 401);
  const existingLimited = await loginRequest(baseUrl, { identifier: 'existing@example.com', ip: '10.0.4.3' });
  const absentLimited = await loginRequest(baseUrl, { identifier: 'absent@example.com', ip: '10.0.4.4' });

  assert.equal(existingLimited.status, 429);
  assert.equal(absentLimited.status, 429);
  assert.deepEqual(await existingLimited.json(), await absentLimited.json());
});
