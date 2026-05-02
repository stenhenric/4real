import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import {
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  getAuthCookieClearOptions,
  getAuthCookieOptions,
  getRefreshCookieClearOptions,
  getRefreshCookieOptions,
} from '../config/cookies.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeAuthUser } from '../serializers/api.ts';
import { resolveAuthEmail } from '../services/auth-identity.service.ts';
import {
  decodeAuthToken,
  decodeRefreshToken,
  signAuthToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/auth-token.service.ts';
import { UserService } from '../services/user.service.ts';
import { badRequest, conflict, notFound, serviceUnavailable, unauthorized } from '../utils/http-error.ts';
import type { LoginRequest, RegisterRequest } from '../validation/request-schemas.ts';

function issueAuthCookies(
  res: Response,
  payload: {
    id: string;
    isAdmin: boolean;
    tokenVersion: number;
  },
): void {
  res.cookie(AUTH_COOKIE_NAME, signAuthToken(payload), getAuthCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, signRefreshToken(payload), getRefreshCookieOptions());
}

async function revokeSessionFromToken(token: string, decodeToken: (value: string) => { id: string; tokenVersion: number }, requestId: string) {
  const payload = decodeToken(token);
  const revoked = await UserService.bumpTokenVersionIfCurrent(payload.id, payload.tokenVersion);
  if (revoked) {
    return true;
  }

  const authState = await UserService.getAuthState(payload.id);
  const alreadyRevoked = !authState || authState.tokenVersion > payload.tokenVersion;
  if (!alreadyRevoked) {
    throw serviceUnavailable('Logout revocation failed', 'LOGOUT_REVOCATION_FAILED', {
      requestId,
    });
  }

  return false;
}

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    const { username, password, email: rawEmail } = req.body as RegisterRequest;
    const email = resolveAuthEmail({
      username,
      ...(rawEmail ? { email: rawEmail } : {}),
    });

    if (!email) {
      throw badRequest('Please provide a valid username or email');
    }

    const [existingUser, existingUsername] = await Promise.all([
      UserService.findByEmail(email),
      UserService.findByUsername(username),
    ]);

    if (existingUser) {
      throw conflict('Email already exists', 'EMAIL_ALREADY_EXISTS', { field: 'email' });
    }

    if (existingUsername) {
      throw conflict('Username already exists', 'USERNAME_ALREADY_EXISTS', { field: 'username' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserService.createUser({
      username,
      email,
      passwordHash,
      elo: 1000,
      isAdmin: false,
    });
    const balance = await UserService.getDisplayBalance(user._id.toString());

    issueAuthCookies(res, {
      id: user._id.toString(),
      isAdmin: user.isAdmin,
      tokenVersion: user.tokenVersion ?? 0,
    });
    res.status(201).json(serializeAuthUser(user, balance));
  }

  static async login(req: Request, res: Response): Promise<void> {
    const loginRequest = req.body as LoginRequest;
    const { password } = loginRequest;
    const email = resolveAuthEmail({
      ...(loginRequest.email ? { email: loginRequest.email } : {}),
      ...(loginRequest.username ? { username: loginRequest.username } : {}),
      ...(loginRequest.identifier ? { identifier: loginRequest.identifier } : {}),
    });

    if (!email) {
      throw badRequest('Please provide email or username');
    }

    const user = await UserService.findByEmail(email);
    if (!user) {
      throw badRequest('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw badRequest('Invalid credentials');
    }

    const authPayload = {
      id: user._id.toString(),
      isAdmin: user.isAdmin,
      tokenVersion: user.tokenVersion ?? 0,
    };
    const balance = await UserService.getDisplayBalance(user._id.toString());
    issueAuthCookies(res, authPayload);
    res.status(200).json(serializeAuthUser(user, balance));
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);

    const user = await UserService.findById(req.user.id);
    if (!user) {
      throw notFound('User not found');
    }

    res.json(serializeAuthUser(user, await UserService.getDisplayBalance(req.user.id)));
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const tokenCandidates = [
      {
        token: req.cookies?.[AUTH_COOKIE_NAME],
        decode: decodeAuthToken,
      },
      {
        token: req.cookies?.[REFRESH_COOKIE_NAME],
        decode: decodeRefreshToken,
      },
    ];

    const requestId = res.locals.requestId as string;

    for (const candidate of tokenCandidates) {
      if (typeof candidate.token !== 'string' || candidate.token.length === 0) {
        continue;
      }

      try {
        const revoked = await revokeSessionFromToken(candidate.token, candidate.decode, requestId);
        if (revoked) {
          break;
        }
      } catch (error) {
        if (
          !(error instanceof Error)
          || !('statusCode' in error)
          || error.statusCode !== 401
        ) {
          throw error;
        }
      }
    }

    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieClearOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieClearOptions());
    res.status(204).send();
  }

  static async refreshSession(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw unauthorized('Refresh token required', 'UNAUTHENTICATED');
    }

    const session = await verifyRefreshToken(refreshToken);
    const user = await UserService.findById(session.id);
    if (!user) {
      throw unauthorized('Token revoked', 'TOKEN_REVOKED');
    }

    const balance = await UserService.getDisplayBalance(user._id.toString());
    issueAuthCookies(res, {
      id: user._id.toString(),
      isAdmin: user.isAdmin,
      tokenVersion: session.tokenVersion,
    });
    res.status(200).json(serializeAuthUser(user, balance));
  }
}
