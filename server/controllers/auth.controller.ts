import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { AUTH_COOKIE_NAME, getAuthCookieClearOptions, getAuthCookieOptions } from '../config/cookies.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeAuthUser } from '../serializers/api.ts';
import { resolveAuthEmail } from '../services/auth-identity.service.ts';
import { decodeAuthToken, signAuthToken } from '../services/auth-token.service.ts';
import { UserService } from '../services/user.service.ts';
import { badRequest, notFound, unauthorized } from '../utils/http-error.ts';
import type { LoginRequest, RegisterRequest } from '../validation/request-schemas.ts';

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
      throw badRequest('Email already exists');
    }

    if (existingUsername) {
      throw badRequest('Username already exists');
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

    const token = signAuthToken({
      id: user._id.toString(),
      isAdmin: user.isAdmin,
      tokenVersion: user.tokenVersion ?? 0,
    });
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
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

    const token = signAuthToken({
      id: user._id.toString(),
      isAdmin: user.isAdmin,
      tokenVersion: user.tokenVersion ?? 0,
    });
    const balance = await UserService.getDisplayBalance(user._id.toString());
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
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
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (typeof token === 'string' && token.length > 0) {
      try {
        const payload = decodeAuthToken(token);
        await UserService.bumpTokenVersionIfCurrent(payload.id, payload.tokenVersion);
      } catch {
        // Clearing the cookie still succeeds for malformed or already-invalid tokens.
      }
    }

    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieClearOptions());
    res.status(204).send();
  }
}
