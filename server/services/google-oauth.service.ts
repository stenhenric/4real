import crypto from 'node:crypto';

import { getEnv, getPublicAppOrigin } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';
import { badRequest, serviceUnavailable } from '../utils/http-error.ts';

const GOOGLE_STATE_PREFIX = 'auth:google:state:';
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

interface GoogleStatePayload {
  nonce: string;
  codeVerifier: string;
  redirectTo?: string;
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

function parseJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) {
    throw badRequest('Invalid Google ID token', 'GOOGLE_ID_TOKEN_INVALID');
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function getRedirectUri(): string {
  return new URL(getEnv().GOOGLE_OAUTH_REDIRECT_PATH, getPublicAppOrigin()).toString();
}

export function isGoogleOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export class GoogleOAuthService {
  static async createAuthorizationUrl(redirectTo?: string): Promise<string> {
    const env = getEnv();
    if (!isGoogleOAuthConfigured()) {
      throw serviceUnavailable('Google OAuth is not configured', 'GOOGLE_OAUTH_UNAVAILABLE');
    }

    const state = crypto.randomUUID();
    const nonce = base64UrlEncode(crypto.randomBytes(24));
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));

    const payload: GoogleStatePayload = {
      nonce,
      codeVerifier,
      ...(redirectTo ? { redirectTo } : {}),
    };

    await getRedisClient().setex(
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

    return authorizationUrl.toString();
  }

  static async consumeCallback(params: { state: string; code: string }) {
    const env = getEnv();
    if (!isGoogleOAuthConfigured()) {
      throw serviceUnavailable('Google OAuth is not configured', 'GOOGLE_OAUTH_UNAVAILABLE');
    }

    const stateKey = getGoogleStateKey(params.state);
    const rawState = await getRedisClient().get(stateKey);
    await getRedisClient().del(stateKey);

    if (!rawState) {
      throw badRequest('Google sign-in session expired', 'GOOGLE_STATE_EXPIRED');
    }

    const state = JSON.parse(rawState) as GoogleStatePayload;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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

    const idTokenPayload = parseJwtPayload(tokenPayload.id_token);
    if (idTokenPayload.nonce !== state.nonce) {
      throw badRequest('Google sign-in validation failed', 'GOOGLE_NONCE_MISMATCH');
    }

    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
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

    if (!userInfo.sub || !userInfo.email || userInfo.email_verified !== true) {
      throw badRequest('Google account must have a verified email', 'GOOGLE_EMAIL_NOT_VERIFIED');
    }

    return {
      googleSubject: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name ?? null,
      picture: userInfo.picture ?? null,
      redirectTo: state.redirectTo,
    };
  }
}
