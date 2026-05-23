import assert from 'node:assert/strict';
import test from 'node:test';

import { getEnv, resetEnvCacheForTests } from '../../../../server/config/env.ts';

const VALID_TOTP_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64');

const REQUIRED_BASE_ENV = {
  NODE_ENV: 'test',
  TOTP_ENCRYPTION_KEY: VALID_TOTP_KEY,
  GOOGLE_CLIENT_ID: 'gmail-client-id',
  GOOGLE_CLIENT_SECRET: 'gmail-client-secret',
  GOOGLE_REFRESH_TOKEN: 'gmail-refresh-token',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3000/api/internal/gmail/oauth2/callback',
  EMAIL_FROM: 'botandbag@gmail.com',
} as const;

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries({ ...REQUIRED_BASE_ENV, ...overrides })) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetEnvCacheForTests();

  try {
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetEnvCacheForTests();
  }
}

test('getEnv requires Gmail delivery credentials in every environment', () => {
  withEnv({ GOOGLE_REFRESH_TOKEN: undefined }, () => {
    assert.throws(() => getEnv(), /GOOGLE_REFRESH_TOKEN/i);
  });
});

test('getEnv returns the Gmail delivery settings when they are configured', () => {
  withEnv({}, () => {
    const env = getEnv() as ReturnType<typeof getEnv> & {
      GOOGLE_REFRESH_TOKEN?: string;
      GOOGLE_REDIRECT_URI?: string;
      EMAIL_FROM?: string;
    };

    assert.equal(env.GOOGLE_CLIENT_ID, REQUIRED_BASE_ENV.GOOGLE_CLIENT_ID);
    assert.equal(env.GOOGLE_CLIENT_SECRET, REQUIRED_BASE_ENV.GOOGLE_CLIENT_SECRET);
    assert.equal(env.GOOGLE_REFRESH_TOKEN, REQUIRED_BASE_ENV.GOOGLE_REFRESH_TOKEN);
    assert.equal(env.GOOGLE_REDIRECT_URI, REQUIRED_BASE_ENV.GOOGLE_REDIRECT_URI);
    assert.equal(env.EMAIL_FROM, REQUIRED_BASE_ENV.EMAIL_FROM);
  });
});

test('getEnv derives production allowed origins from PUBLIC_APP_ORIGIN instead of localhost defaults', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: undefined,
  }, () => {
    assert.deepEqual(getEnv().allowedOrigins, ['https://app.example.com']);
  });
});

test('getEnv rejects localhost public origins in production', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'http://localhost:3000',
    ALLOWED_ORIGINS: undefined,
  }, () => {
    assert.throws(() => getEnv(), /PUBLIC_APP_ORIGIN must not be localhost in production/i);
  });
});

test('getEnv rejects cleartext Redis URLs in production', () => {
  withEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'redis://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
  }, () => {
    assert.throws(() => getEnv(), /REDIS_URL must use rediss:\/\/ in production/i);
  });
});

test('getEnv allows Render internal cleartext Redis URLs in production', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    RENDER: 'true',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'redis://red-example-kv:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
  }, () => {
    assert.equal(getEnv().REDIS_URL, 'redis://red-example-kv:6379');
  });
});

test('getEnv documents and enforces single-instance production topology by default', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    PRODUCTION_TOPOLOGY: undefined,
    FEATURE_DISTRIBUTED_LOCK: 'false',
    FEATURE_BULLMQ_JOBS: 'false',
    FEATURE_REDIS_SOCKET_ADAPTER: 'false',
  }, () => {
    assert.equal(getEnv().PRODUCTION_TOPOLOGY, 'single-instance');
  });
});

test('getEnv rejects distributed production topology unless coordination flags are enabled', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    PRODUCTION_TOPOLOGY: 'distributed',
    FEATURE_DISTRIBUTED_LOCK: 'true',
    FEATURE_BULLMQ_JOBS: 'false',
    FEATURE_REDIS_SOCKET_ADAPTER: 'true',
  }, () => {
    assert.throws(() => getEnv(), /distributed production requires FEATURE_DISTRIBUTED_LOCK, FEATURE_BULLMQ_JOBS, and FEATURE_REDIS_SOCKET_ADAPTER/i);
  });
});

test('getEnv requires edge protection for public cacheable GETs in distributed production', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    PRODUCTION_TOPOLOGY: 'distributed',
    FEATURE_DISTRIBUTED_LOCK: 'true',
    FEATURE_BULLMQ_JOBS: 'true',
    FEATURE_REDIS_SOCKET_ADAPTER: 'true',
    PUBLIC_CACHEABLE_GET_EDGE_PROTECTION: 'false',
  }, () => {
    assert.throws(() => getEnv(), /PUBLIC_CACHEABLE_GET_EDGE_PROTECTION=true/i);
  });
});

test('getEnv accepts distributed production when public cacheable GET edge protection is asserted', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    PRODUCTION_TOPOLOGY: 'distributed',
    FEATURE_DISTRIBUTED_LOCK: 'true',
    FEATURE_BULLMQ_JOBS: 'true',
    FEATURE_REDIS_SOCKET_ADAPTER: 'true',
    PUBLIC_CACHEABLE_GET_EDGE_PROTECTION: 'true',
  }, () => {
    assert.equal(getEnv().PUBLIC_CACHEABLE_GET_EDGE_PROTECTION, true);
  });
});

test('getEnv requires explicit bounded TRUST_PROXY in production', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: undefined,
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
  }, () => {
    assert.throws(() => getEnv(), /TRUST_PROXY must be explicitly configured in production/i);
  });

  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: 'true',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
  }, () => {
    assert.throws(() => getEnv(), /TRUST_PROXY=true is not allowed in production/i);
  });
});

test('getEnv rejects multiple Render instances in single-instance production topology when configured', () => {
  withEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    RENDER_INSTANCE_COUNT: '2',
    MONGODB_URI: 'mongodb+srv://example.invalid/4real',
    REDIS_URL: 'rediss://redis.example.invalid:6379',
    PUBLIC_APP_ORIGIN: 'https://app.example.com',
    ALLOWED_ORIGINS: 'https://app.example.com',
    PRODUCTION_TOPOLOGY: 'single-instance',
  }, () => {
    assert.throws(() => getEnv(), /single-instance production requires exactly one Render instance/i);
  });
});

test('getEnv allows cleartext Redis URLs outside production', () => {
  withEnv({
    NODE_ENV: 'test',
    REDIS_URL: 'redis://127.0.0.1:6379',
  }, () => {
    assert.equal(getEnv().REDIS_URL, 'redis://127.0.0.1:6379');
  });
});
