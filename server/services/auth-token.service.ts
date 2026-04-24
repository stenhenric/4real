import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { getJwtSecret } from '../config/config.ts';
import type { JwtUser } from '../types/api.ts';
import { UserService } from './user.service.ts';
import { unauthorized } from '../utils/http-error.ts';

export function signAuthToken(payload: JwtUser): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
}

export function decodeAuthToken(token: string): JwtUser {
  const decoded = jwt.verify(token, getJwtSecret());

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

  return {
    id: String(decoded.id),
    isAdmin: Boolean(decoded.isAdmin),
    tokenVersion,
  };
}

export async function verifyAuthToken(token: string): Promise<JwtUser> {
  const payload = decodeAuthToken(token);
  const currentTokenVersion = await UserService.getTokenVersion(payload.id);

  if (currentTokenVersion === null || currentTokenVersion !== payload.tokenVersion) {
    throw unauthorized('Token revoked');
  }

  return payload;
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
