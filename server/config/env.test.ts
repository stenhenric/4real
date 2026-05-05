import assert from 'node:assert/strict';
import test from 'node:test';

import { getEnv, resetEnvCacheForTests } from './env.ts';

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
