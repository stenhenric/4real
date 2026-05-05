import assert from 'node:assert/strict';
import test from 'node:test';

import { resetEnvCacheForTests } from '../config/env.ts';
import { OneTimeTokenService } from './one-time-token.service.ts';
import {
  AuthEmailService,
  resetAuthEmailDependenciesForTests,
  setAuthEmailDependenciesForTests,
} from './auth-email.service.ts';

const VALID_TOTP_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64');

function withEmailEnv(run: () => Promise<void> | void) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.TOTP_ENCRYPTION_KEY = VALID_TOTP_KEY;
  process.env.GOOGLE_CLIENT_ID = 'gmail-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'gmail-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'gmail-refresh-token';
  process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/api/internal/gmail/oauth2/callback';
  process.env.EMAIL_FROM = 'botandbag@gmail.com';
  resetEnvCacheForTests();

  return Promise.resolve(run()).finally(() => {
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

test('sendVerificationEmail revokes the fresh token when Gmail delivery fails', async (t) => {
  const revokeActiveMock = t.mock.method(OneTimeTokenService, 'revokeActiveTokensForUser', async () => undefined);
  const revokeTokenMock = t.mock.method(OneTimeTokenService, 'revoke', async () => undefined);
  const createMock = t.mock.method(OneTimeTokenService, 'create', async () => 'verification-token');
  let sendCallCount = 0;
  setAuthEmailDependenciesForTests({
    deliverVerificationEmail: async () => {
      sendCallCount += 1;
      throw new Error('gmail send failure');
    },
  });

  try {
    await withEmailEnv(async () => {
      await assert.rejects(
        () => AuthEmailService.sendVerificationEmail('user-123', 'alice@example.com'),
        (error: unknown) => typeof error === 'object'
          && error !== null
          && 'code' in error
          && (error as { code?: string }).code === 'EMAIL_DELIVERY_FAILED',
      );
    });
  } finally {
    resetAuthEmailDependenciesForTests();
    resetEnvCacheForTests();
  }

  assert.equal(createMock.mock.callCount(), 1);
  assert.equal(sendCallCount, 1);
  assert.equal(revokeActiveMock.mock.callCount(), 1);
  assert.deepEqual(revokeActiveMock.mock.calls[0]?.arguments, ['user-123', ['email_verification']]);
  assert.equal(revokeTokenMock.mock.callCount(), 1);
  assert.deepEqual(revokeTokenMock.mock.calls[0]?.arguments, ['email_verification', 'verification-token']);
});
