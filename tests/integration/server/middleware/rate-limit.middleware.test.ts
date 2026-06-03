import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import express from 'express';

import { resetEnvCacheForTests } from '../../../../server/config/env.ts';
import { setRedisClientForTests } from '../../../../server/services/redis.service.ts';
import {
  createAdminMutationRateLimiter,
  createAuthEmailRecipientRateLimiter,
  createAuthRateLimiter,
  createDepositOperationRateLimiter,
  createGeneralRateLimiter,
  createMatchMutationRateLimiter,
  createOrderCreateRateLimiter,
  createPasswordLoginIdentifierRateLimiter,
  createPublicCacheableGetRateLimiter,
  createWithdrawalRateLimiter,
} from '../../../../server/middleware/rate-limit.middleware.ts';

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
    AUTH_EMAIL_RECIPIENT_RATE_LIMIT_WINDOW_MS: process.env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_WINDOW_MS,
    AUTH_EMAIL_RECIPIENT_RATE_LIMIT_MAX: process.env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_MAX,
    DEPOSIT_OPERATION_RATE_LIMIT_WINDOW_MS: process.env.DEPOSIT_OPERATION_RATE_LIMIT_WINDOW_MS,
    DEPOSIT_OPERATION_RATE_LIMIT_MAX: process.env.DEPOSIT_OPERATION_RATE_LIMIT_MAX,
    ORDER_CREATE_RATE_LIMIT_WINDOW_MS: process.env.ORDER_CREATE_RATE_LIMIT_WINDOW_MS,
    ORDER_CREATE_RATE_LIMIT_MAX: process.env.ORDER_CREATE_RATE_LIMIT_MAX,
    MATCH_MUTATION_RATE_LIMIT_WINDOW_MS: process.env.MATCH_MUTATION_RATE_LIMIT_WINDOW_MS,
    MATCH_MUTATION_RATE_LIMIT_MAX: process.env.MATCH_MUTATION_RATE_LIMIT_MAX,
    ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS: process.env.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS,
    ADMIN_MUTATION_RATE_LIMIT_MAX: process.env.ADMIN_MUTATION_RATE_LIMIT_MAX,
    WITHDRAWAL_RATE_LIMIT_WINDOW_MS: process.env.WITHDRAWAL_RATE_LIMIT_WINDOW_MS,
    WITHDRAWAL_RATE_LIMIT_MAX: process.env.WITHDRAWAL_RATE_LIMIT_MAX,
  };

  delete process.env.REDIS_URL;
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.AUTH_RATE_LIMIT_MAX = max;
  process.env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.AUTH_EMAIL_RECIPIENT_RATE_LIMIT_MAX = max;
  process.env.DEPOSIT_OPERATION_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.DEPOSIT_OPERATION_RATE_LIMIT_MAX = max;
  process.env.ORDER_CREATE_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.ORDER_CREATE_RATE_LIMIT_MAX = max;
  process.env.MATCH_MUTATION_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.MATCH_MUTATION_RATE_LIMIT_MAX = max;
  process.env.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.ADMIN_MUTATION_RATE_LIMIT_MAX = max;
  process.env.WITHDRAWAL_RATE_LIMIT_WINDOW_MS = '60000';
  process.env.WITHDRAWAL_RATE_LIMIT_MAX = max;
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

async function startActorRateLimitApp(t: TestContext, handler: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/expensive', (req, _res, next) => {
    (req as any).user = {
      id: typeof req.body?.userId === 'string' ? req.body.userId : 'user-1',
    };
    next();
  }, handler, (_req, res) => {
    res.status(202).json({ status: 'accepted' });
  });

  const server = app.listen(0);
  t.after(() => {
    server.close();
  });
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function startAuthEmailRateLimitApp(t: TestContext, handler: express.RequestHandler) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post(
    '/api/auth/password/forgot',
    createAuthEmailRecipientRateLimiter(),
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

function authEmailRequest(baseUrl: string, params: {
  email: string;
  ip?: string;
}) {
  return fetch(`${baseUrl}/api/auth/password/forgot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.ip ? { 'X-Forwarded-For': params.ip } : {}),
    },
    body: JSON.stringify({
      email: params.email,
    }),
  });
}

function expensiveRequest(baseUrl: string, params: {
  userId: string;
  ip?: string;
}) {
  return fetch(`${baseUrl}/expensive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.ip ? { 'X-Forwarded-For': params.ip } : {}),
    },
    body: JSON.stringify({
      userId: params.userId,
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

test('auth email recipient limiter blocks repeated requests for one normalized email across IPs', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startAuthEmailRateLimitApp(t, (_req, res) => {
    res.status(202).json({ status: 'accepted' });
  });

  assert.equal((await authEmailRequest(baseUrl, { email: 'Alice@Example.com', ip: '10.0.5.1' })).status, 202);
  assert.equal((await authEmailRequest(baseUrl, { email: ' alice@example.com ', ip: '10.0.5.2' })).status, 202);
  const limited = await authEmailRequest(baseUrl, { email: 'ALICE@example.com', ip: '10.0.5.3' });

  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: 'AUTH_EMAIL_RATE_LIMITED',
    message: 'Too many requests, please try again later.',
  });
  assert.equal((await authEmailRequest(baseUrl, { email: 'bob@example.com', ip: '10.0.5.4' })).status, 202);
});

test('expensive operation limiters are keyed by authenticated user instead of IP', async (t) => {
  withAuthRateLimitEnv(t);

  for (const [name, limiter] of [
    ['deposit', createDepositOperationRateLimiter()],
    ['order', createOrderCreateRateLimiter()],
    ['match', createMatchMutationRateLimiter()],
    ['admin', createAdminMutationRateLimiter()],
  ] as const) {
    await t.test(name, async (subtest) => {
      const baseUrl = await startActorRateLimitApp(subtest, limiter);

      assert.equal((await expensiveRequest(baseUrl, { userId: `${name}-user`, ip: '10.0.6.1' })).status, 202);
      assert.equal((await expensiveRequest(baseUrl, { userId: `${name}-user`, ip: '10.0.6.2' })).status, 202);
      const limited = await expensiveRequest(baseUrl, { userId: `${name}-user`, ip: '10.0.6.3' });

      assert.equal(limited.status, 429);
      assert.deepEqual(await limited.json(), {
        code: 'OPERATION_RATE_LIMITED',
        message: 'Too many requests for this operation, please try again later.',
      });
      assert.equal((await expensiveRequest(baseUrl, { userId: `${name}-other`, ip: '10.0.6.4' })).status, 202);
    });
  }
});

test('withdrawal limiter is keyed by authenticated user instead of IP', async (t) => {
  withAuthRateLimitEnv(t);
  const baseUrl = await startActorRateLimitApp(t, createWithdrawalRateLimiter());

  assert.equal((await expensiveRequest(baseUrl, { userId: 'withdraw-user', ip: '10.0.7.1' })).status, 202);
  assert.equal((await expensiveRequest(baseUrl, { userId: 'withdraw-user', ip: '10.0.7.2' })).status, 202);
  const limited = await expensiveRequest(baseUrl, { userId: 'withdraw-user', ip: '10.0.7.3' });

  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), {
    code: 'WITHDRAWAL_RATE_LIMITED',
    message: 'Too many withdrawal requests, please try again later.',
  });
  assert.equal((await expensiveRequest(baseUrl, { userId: 'withdraw-other', ip: '10.0.7.4' })).status, 202);
});

test('expensive authenticated mutation routes apply route-specific limiters before handlers', () => {
  const transactionsRoutes = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'transactions.routes.ts'),
    'utf8',
  );
  const ordersRoutes = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'orders.routes.ts'),
    'utf8',
  );
  const matchesRoutes = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'matches.routes.ts'),
    'utf8',
  );
  const adminRoutes = fs.readFileSync(
    path.join(process.cwd(), 'server', 'routes', 'admin.routes.ts'),
    'utf8',
  );

  assert.match(transactionsRoutes, /router\.post\('\/deposit\/memo',\s*createDepositOperationRateLimiter\(\),\s*asyncHandler\(generateDepositMemoHandler\)\)/s);
  assert.match(transactionsRoutes, /router\.post\('\/deposit\/prepare',\s*createDepositOperationRateLimiter\(\),\s*validateBody\(prepareTonConnectDepositRequestSchema\),\s*asyncHandler\(prepareTonConnectDepositHandler\)\)/s);
  assert.match(transactionsRoutes, /router\.post\('\/withdraw',\s*createWithdrawalRateLimiter\(\),\s*validateBody\(withdrawRequestSchema\),\s*asyncHandler\(requestWithdrawalHandler\)\)/s);
  assert.match(ordersRoutes, /router\.post\('\/',\s*createOrderCreateRateLimiter\(\),\s*asyncHandler\(OrderController\.createOrder\)\)/s);
  assert.match(ordersRoutes, /router\.patch\(\s*'\/:id',\s*requireAdmin,\s*requireMfaStepUp,\s*createAdminMutationRateLimiter\(\),\s*validateBody\(updateOrderStatusRequestSchema\),\s*asyncHandler\(OrderController\.updateOrder\),?\s*\)/s);
  assert.match(matchesRoutes, /router\.post\('\/',\s*createMatchMutationRateLimiter\(\),\s*validateBody\(createMatchRequestSchema\),\s*asyncHandler\(MatchController\.createMatch\)\)/s);
  assert.match(matchesRoutes, /router\.post\('\/:roomId\/join',\s*createMatchMutationRateLimiter\(\),\s*asyncHandler\(MatchController\.joinMatch\)\)/s);
  assert.match(matchesRoutes, /router\.post\('\/:roomId\/resign',\s*createMatchMutationRateLimiter\(\),\s*asyncHandler\(MatchController\.resignMatch\)\)/s);
  assert.match(adminRoutes, /router\.post\(\s*'\/merchant\/deposits\/replay-window',\s*createAdminMutationRateLimiter\(\),\s*validateBody\(merchantDepositReplayWindowRequestSchema\),\s*asyncHandler\(MerchantAdminController\.replayDepositWindow\)/s);
  assert.match(adminRoutes, /router\.post\(\s*'\/merchant\/deposits\/:txHash\/reconcile',\s*createAdminMutationRateLimiter\(\),\s*validateBody\(merchantDepositReconcileRequestSchema\),\s*asyncHandler\(MerchantAdminController\.reconcileDeposit\)/s);
  assert.match(adminRoutes, /router\.post\(\s*'\/withdrawals\/:withdrawalId\/recover',\s*createAdminMutationRateLimiter\(\),\s*validateBody\(withdrawalRecoveryRequestSchema\),\s*asyncHandler\(WithdrawalRecoveryController\.recover\)/s);
  assert.match(adminRoutes, /router\.patch\(\s*'\/merchant\/config',\s*createAdminMutationRateLimiter\(\),\s*validateBody\(updateMerchantConfigRequestSchema\),\s*asyncHandler\(MerchantAdminController\.updateConfig\),?\s*\)/s);
});
