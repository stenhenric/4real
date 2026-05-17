import crypto from 'node:crypto';

import { OAuth2Client } from 'google-auth-library';

import { getEnv, getPublicAppOrigin } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';
import { hashOpaqueToken } from './auth-crypto.service.ts';
import { badRequest, serviceUnavailable } from '../utils/http-error.ts';

const GOOGLE_STATE_PREFIX = 'auth:google:state:';
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

interface GoogleStatePayload {
  nonce: string;
  codeVerifier: string;
  browserStateHash: string;
  redirectTo?: string;
}

interface VerifiedGoogleIdTokenPayload {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  nonce?: unknown;
}

interface GoogleOAuthDependencies {
  setState: (key: string, ttlSeconds: number, value: string) => Promise<unknown>;
  getState: (key: string) => Promise<string | null>;
  deleteState: (key: string) => Promise<unknown>;
  fetch: typeof fetch;
  verifyIdToken: (params: { idToken: string; audience: string }) => Promise<VerifiedGoogleIdTokenPayload>;
}

function getGoogleStateKey(state: string): string {
  return `${GOOGLE_STATE_PREFIX}${state}`;
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function createPkceChallenge(codeVerifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
}

function getRedirectUri(): string {
  return new URL(getEnv().GOOGLE_OAUTH_REDIRECT_PATH, getPublicAppOrigin()).toString();
}

export function isGoogleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

const defaultGoogleOAuthDependencies: GoogleOAuthDependencies = {
  setState: (key, ttlSeconds, value) => getRedisClient().setex(key, ttlSeconds, value),
  getState: (key) => getRedisClient().get(key),
  deleteState: (key) => getRedisClient().del(key),
  fetch: globalThis.fetch.bind(globalThis),
  verifyIdToken: async ({ idToken, audience }) => {
    const ticket = await new OAuth2Client(audience).verifyIdToken({
      idToken,
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Google ID token payload is empty');
    }

    return payload;
  },
};

const googleOAuthDependencies: GoogleOAuthDependencies = {
  ...defaultGoogleOAuthDependencies,
};

export function setGoogleOAuthDependenciesForTests(overrides: Partial<GoogleOAuthDependencies>): void {
  Object.assign(googleOAuthDependencies, overrides);
}

export function resetGoogleOAuthDependenciesForTests(): void {
  Object.assign(googleOAuthDependencies, defaultGoogleOAuthDependencies);
}

function parseGoogleState(rawState: string): GoogleStatePayload {
  try {
    const parsed = JSON.parse(rawState) as Partial<GoogleStatePayload>;
    if (
      typeof parsed.nonce !== 'string'
      || typeof parsed.codeVerifier !== 'string'
      || typeof parsed.browserStateHash !== 'string'
      || (parsed.redirectTo !== undefined && typeof parsed.redirectTo !== 'string')
    ) {
      throw new Error('Invalid Google OAuth state shape');
    }

    return {
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
      browserStateHash: parsed.browserStateHash,
      ...(parsed.redirectTo ? { redirectTo: parsed.redirectTo } : {}),
    };
  } catch {
    throw badRequest('Google sign-in session is invalid', 'GOOGLE_STATE_INVALID');
  }
}

async function verifyGoogleIdToken(idToken: string, audience: string): Promise<{
  sub: string;
  email: string;
  emailVerified: true;
  nonce: string;
}> {
  let payload: VerifiedGoogleIdTokenPayload;
  try {
    payload = await googleOAuthDependencies.verifyIdToken({ idToken, audience });
  } catch {
    throw badRequest('Invalid Google ID token', 'GOOGLE_ID_TOKEN_INVALID');
  }

  if (
    typeof payload.sub !== 'string'
    || typeof payload.email !== 'string'
    || payload.email_verified !== true
    || typeof payload.nonce !== 'string'
  ) {
    throw badRequest('Google account must have a verified email', 'GOOGLE_EMAIL_NOT_VERIFIED');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    nonce: payload.nonce,
  };
}

export class GoogleOAuthService {
  static async createAuthorizationRequest(redirectTo?: string): Promise<{
    authorizationUrl: string;
    browserState: string;
  }> {
    const env = getEnv();
    if (!isGoogleOAuthConfigured()) {
      throw serviceUnavailable('Google OAuth is not configured', 'GOOGLE_OAUTH_UNAVAILABLE');
    }

    const state = crypto.randomUUID();
    const nonce = base64UrlEncode(crypto.randomBytes(24));
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const browserState = base64UrlEncode(crypto.randomBytes(24));

    const payload: GoogleStatePayload = {
      nonce,
      codeVerifier,
      browserStateHash: hashOpaqueToken(browserState),
      ...(redirectTo ? { redirectTo } : {}),
    };

    await googleOAuthDependencies.setState(
      getGoogleStateKey(state),
      GOOGLE_STATE_TTL_SECONDS,
      JSON.stringify(payload),
    );

    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.searchParams.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID ?? '');
    authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', createPkceChallenge(codeVerifier));
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('prompt', 'select_account');

    return {
      authorizationUrl: authorizationUrl.toString(),
      browserState,
    };
  }

  static async createAuthorizationUrl(redirectTo?: string): Promise<string> {
    return (await this.createAuthorizationRequest(redirectTo)).authorizationUrl;
  }

  static async consumeCallback(params: { state: string; code: string; browserState?: string | null }) {
    const env = getEnv();
    if (!isGoogleOAuthConfigured()) {
      throw serviceUnavailable('Google OAuth is not configured', 'GOOGLE_OAUTH_UNAVAILABLE');
    }

    const stateKey = getGoogleStateKey(params.state);
    const rawState = await googleOAuthDependencies.getState(stateKey);
    await googleOAuthDependencies.deleteState(stateKey);

    if (!rawState) {
      throw badRequest('Google sign-in session expired', 'GOOGLE_STATE_EXPIRED');
    }

    const state = parseGoogleState(rawState);
    if (
      typeof params.browserState !== 'string'
      || params.browserState.length === 0
      || hashOpaqueToken(params.browserState) !== state.browserStateHash
    ) {
      throw badRequest('Google sign-in session is invalid', 'GOOGLE_STATE_INVALID');
    }

    const tokenResponse = await googleOAuthDependencies.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
        code_verifier: state.codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw serviceUnavailable('Google sign-in failed', 'GOOGLE_TOKEN_EXCHANGE_FAILED');
    }

    const tokenPayload = await tokenResponse.json() as {
      access_token?: string;
      id_token?: string;
    };

    if (!tokenPayload.access_token || !tokenPayload.id_token) {
      throw serviceUnavailable('Google sign-in failed', 'GOOGLE_TOKEN_EXCHANGE_FAILED');
    }

    const verifiedIdToken = await verifyGoogleIdToken(
      tokenPayload.id_token,
      env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    );
    if (verifiedIdToken.nonce !== state.nonce) {
      throw badRequest('Google sign-in validation failed', 'GOOGLE_NONCE_MISMATCH');
    }

    const userInfoResponse = await googleOAuthDependencies.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    });
    if (!userInfoResponse.ok) {
      throw serviceUnavailable('Google sign-in failed', 'GOOGLE_USERINFO_FAILED');
    }

    const userInfo = await userInfoResponse.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (
      userInfo.sub !== verifiedIdToken.sub
      || userInfo.email !== verifiedIdToken.email
    ) {
      throw badRequest('Google sign-in identity mismatch', 'GOOGLE_IDENTITY_MISMATCH');
    }

    if (userInfo.email_verified !== true) {
      throw badRequest('Google account must have a verified email', 'GOOGLE_EMAIL_NOT_VERIFIED');
    }

    return {
      googleSubject: verifiedIdToken.sub,
      email: verifiedIdToken.email,
      name: userInfo.name ?? null,
      picture: userInfo.picture ?? null,
      redirectTo: state.redirectTo,
    };
  }
}
