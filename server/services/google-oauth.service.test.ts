import assert from 'node:assert/strict';
import test from 'node:test';

import { resetEnvCacheForTests } from '../config/env.ts';
import {
  GoogleOAuthService,
  resetGoogleOAuthDependenciesForTests,
  setGoogleOAuthDependenciesForTests,
} from './google-oauth.service.ts';

const VALID_TOTP_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').toString('base64');

function withOAuthEnv(run: () => Promise<void> | void) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_ORIGIN: process.env.PUBLIC_APP_ORIGIN,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.TOTP_ENCRYPTION_KEY = VALID_TOTP_KEY;
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-oauth-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-oauth-client-secret';
  process.env.GOOGLE_CLIENT_ID = 'gmail-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'gmail-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'gmail-refresh-token';
  process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/oauth2/gmail/callback';
  process.env.EMAIL_FROM = 'botandbag@gmail.com';
  resetEnvCacheForTests();

  return Promise.resolve(run()).finally(() => {
    resetGoogleOAuthDependenciesForTests();
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

function createJsonResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response;
}

test('consumeCallback verifies the Google ID token with the configured OAuth audience', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();
    const verifiedAudiences: string[] = [];
    const verifiedTokens: string[] = [];
    let nonce = '';

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
        nonce = JSON.parse(value).nonce as string;
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
      fetch: async (url) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return createJsonResponse(true, {
            access_token: 'google-access-token',
            id_token: 'signed-google-id-token',
          });
        }

        return createJsonResponse(true, {
          sub: 'google-sub-1',
          email: 'alice@example.com',
          email_verified: true,
          name: 'Alice',
          picture: 'https://example.com/alice.png',
        });
      },
      verifyIdToken: async ({ idToken, audience }) => {
        verifiedTokens.push(idToken);
        verifiedAudiences.push(audience);
        return {
          sub: 'google-sub-1',
          email: 'alice@example.com',
          email_verified: true,
          nonce,
        };
      },
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest('/play');
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    const profile = await GoogleOAuthService.consumeCallback({
      state,
      code: 'auth-code',
      browserState: authorizationRequest.browserState,
    });

    assert.deepEqual(verifiedTokens, ['signed-google-id-token']);
    assert.deepEqual(verifiedAudiences, ['google-oauth-client-id']);
    assert.equal(profile.googleSubject, 'google-sub-1');
    assert.equal(profile.email, 'alice@example.com');
    assert.equal(profile.redirectTo, '/play');
  });
});

test('consumeCallback rejects ID tokens that fail Google verification', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();
    const deletedStateKeys: string[] = [];

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        deletedStateKeys.push(key);
        stateStore.delete(key);
      },
      fetch: async () => createJsonResponse(true, {
        access_token: 'google-access-token',
        id_token: 'bad-id-token',
      }),
      verifyIdToken: async () => {
        throw new Error('wrong audience');
      },
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({
        state,
        code: 'auth-code',
        browserState: authorizationRequest.browserState,
      }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_ID_TOKEN_INVALID',
    );
    assert.equal(deletedStateKeys.length, 1);
  });
});

test('consumeCallback rejects ID tokens with a mismatched nonce', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
      fetch: async () => createJsonResponse(true, {
        access_token: 'google-access-token',
        id_token: 'signed-google-id-token',
      }),
      verifyIdToken: async () => ({
        sub: 'google-sub-1',
        email: 'alice@example.com',
        email_verified: true,
        nonce: 'different-nonce',
      }),
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({
        state,
        code: 'auth-code',
        browserState: authorizationRequest.browserState,
      }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_NONCE_MISMATCH',
    );
  });
});

test('consumeCallback rejects userinfo that does not match the verified token subject', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();
    let nonce = '';

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
        nonce = JSON.parse(value).nonce as string;
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
      fetch: async (url) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return createJsonResponse(true, {
            access_token: 'google-access-token',
            id_token: 'signed-google-id-token',
          });
        }

        return createJsonResponse(true, {
          sub: 'different-google-sub',
          email: 'alice@example.com',
          email_verified: true,
        });
      },
      verifyIdToken: async () => ({
        sub: 'google-sub-1',
        email: 'alice@example.com',
        email_verified: true,
        nonce,
      }),
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({
        state,
        code: 'auth-code',
        browserState: authorizationRequest.browserState,
      }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_IDENTITY_MISMATCH',
    );
  });
});

test('consumeCallback rejects a Google userinfo profile with an unverified email', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();
    let nonce = '';

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
        nonce = JSON.parse(value).nonce as string;
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
      fetch: async (url) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return createJsonResponse(true, {
            access_token: 'google-access-token',
            id_token: 'signed-google-id-token',
          });
        }

        return createJsonResponse(true, {
          sub: 'google-sub-1',
          email: 'alice@example.com',
          email_verified: false,
        });
      },
      verifyIdToken: async () => ({
        sub: 'google-sub-1',
        email: 'alice@example.com',
        email_verified: true,
        nonce,
      }),
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({
        state,
        code: 'auth-code',
        browserState: authorizationRequest.browserState,
      }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_EMAIL_NOT_VERIFIED',
    );
  });
});

test('consumeCallback rejects a valid OAuth state without the browser binding cookie value', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({ state, code: 'auth-code' }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_STATE_INVALID',
    );
  });
});

test('consumeCallback rejects a valid OAuth state with a mismatched browser binding value', async () => {
  await withOAuthEnv(async () => {
    const stateStore = new Map<string, string>();

    setGoogleOAuthDependenciesForTests({
      setState: async (key, _ttlSeconds, value) => {
        stateStore.set(key, value);
      },
      getState: async (key) => stateStore.get(key) ?? null,
      deleteState: async (key) => {
        stateStore.delete(key);
      },
    });

    const authorizationRequest = await GoogleOAuthService.createAuthorizationRequest();
    const authorizationUrl = new URL(authorizationRequest.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);

    await assert.rejects(
      () => GoogleOAuthService.consumeCallback({
        state,
        code: 'auth-code',
        browserState: 'different-browser-state',
      }),
      (error: unknown) => typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === 'GOOGLE_STATE_INVALID',
    );
  });
});
