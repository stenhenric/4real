import assert from 'node:assert/strict';
import test from 'node:test';

import type { Request, Response } from 'express';

import { resetEnvCacheForTests } from '../config/env.ts';
import { AuthController } from '../controllers/auth.controller.ts';
import { AuthEmailService } from '../services/auth-email.service.ts';
import { UserService } from '../services/user.service.ts';

const VALID_TOTP_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64');

function createResponseMock() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  } as Response & {
    statusCode: number;
    payload: unknown;
  };
}

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

test('requestPasswordReset omits previewUrl when the backend sends a reset email', async (t) => {
  t.mock.method(UserService, 'findByEmail', async () => ({
    _id: { toString: () => 'user-123' },
    email: 'alice@example.com',
    emailVerifiedAt: new Date('2026-05-05T00:00:00.000Z'),
  }) as Awaited<ReturnType<typeof UserService.findByEmail>>);
  t.mock.method(AuthEmailService, 'sendPasswordResetEmail', async () => 'http://127.0.0.1:3000/auth/reset-password?token=abc');

  await withEmailEnv(async () => {
    const req = {
      body: { email: 'alice@example.com', turnstileToken: undefined },
      ip: '127.0.0.1',
    } as Request;
    const res = createResponseMock();

    await AuthController.requestPasswordReset(req, res);

    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.payload, {
      status: 'password_reset_requested',
      message: 'If the account exists, a reset email is on the way.',
    });
  });
});
