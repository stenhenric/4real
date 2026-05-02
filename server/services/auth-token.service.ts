import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { getJwtSecret } from '../config/config.ts';
import type { JwtUser } from '../types/api.ts';
import { UserService } from './user.service.ts';
import { unauthorized } from '../utils/http-error.ts';

type TokenType = 'access' | 'refresh';
type SignedJwtPayload = JwtUser & { tokenType?: TokenType };

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

export function signAuthToken(payload: JwtUser): string {
  return jwt.sign({ ...payload, tokenType: 'access' } satisfies SignedJwtPayload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function signRefreshToken(payload: JwtUser): string {
  return jwt.sign({ ...payload, tokenType: 'refresh' } satisfies SignedJwtPayload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

function decodeToken(token: string, expectedType: TokenType): JwtUser {
  let decoded: jwt.JwtPayload | string;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      throw unauthorized('Token expired', 'TOKEN_EXPIRED');
    }

    throw unauthorized('Invalid token', 'INVALID_TOKEN');
  }

  if (
    !decoded ||
    typeof decoded === 'string' ||
    !('id' in decoded) ||
    !('isAdmin' in decoded) ||
    !('tokenVersion' in decoded)
  ) {
    throw unauthorized('Invalid token payload');
  }

  const tokenVersion = Number(decoded.tokenVersion);
  if (!Number.isInteger(tokenVersion) || tokenVersion < 0) {
    throw unauthorized('Invalid token payload');
  }

  const tokenType = 'tokenType' in decoded ? decoded.tokenType : undefined;
  if (
    tokenType !== undefined
    && tokenType !== expectedType
  ) {
    throw unauthorized('Invalid token payload');
  }

  return {
    id: String(decoded.id),
    isAdmin: Boolean(decoded.isAdmin),
    tokenVersion,
  };
}

export function decodeAuthToken(token: string): JwtUser {
  return decodeToken(token, 'access');
}

export function decodeRefreshToken(token: string): JwtUser {
  return decodeToken(token, 'refresh');
}

export async function verifyAuthToken(token: string): Promise<JwtUser> {
  const payload = decodeAuthToken(token);
  const authState = await UserService.getAuthState(payload.id);

  if (!authState || authState.tokenVersion !== payload.tokenVersion) {
    throw unauthorized('Token revoked');
  }

  return {
    ...payload,
    isAdmin: authState.isAdmin,
  };
}

export async function verifyRefreshToken(token: string): Promise<JwtUser> {
  const payload = decodeRefreshToken(token);
  const authState = await UserService.getAuthState(payload.id);

  if (!authState || authState.tokenVersion !== payload.tokenVersion) {
    throw unauthorized('Token revoked');
  }

  return {
    ...payload,
    isAdmin: authState.isAdmin,
  };
}

export function extractTokenFromCookieHeader(cookieHeader?: string): string | undefined {
  const tokenPair = cookieHeader
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${AUTH_COOKIE_NAME}=`));

  return tokenPair ? decodeURIComponent(tokenPair.split('=')[1] ?? '') : undefined;
}

export function extractSocketToken(handshake: Socket['handshake']): string | undefined {
  const authToken = typeof handshake.auth?.token === 'string' ? handshake.auth.token : undefined;
  return authToken ?? extractTokenFromCookieHeader(handshake.headers.cookie);
}
