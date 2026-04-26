import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorDTO } from '../../shared/types/api.ts';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { verifyAuthToken } from '../services/auth-token.service.ts';
import type { JwtUser } from '../types/api.ts';

export interface AuthRequest extends Request {
  user?: JwtUser;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    const payload: ApiErrorDTO = {
      code: 'UNAUTHENTICATED',
      message: 'Access token required',
    };
    res.status(401).json(payload);
    return;
  }

  void verifyAuthToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Invalid token';
      const code = message === 'Token revoked'
        ? 'TOKEN_REVOKED'
        : message === 'Invalid token payload'
          ? 'INVALID_TOKEN_PAYLOAD'
          : 'INVALID_TOKEN';
      const payload: ApiErrorDTO = {
        code,
        message,
      };
      res.status(401).json(payload);
    });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    const payload: ApiErrorDTO = {
      code: 'ADMIN_ACCESS_REQUIRED',
      message: 'Admin access required',
    };
    res.status(403).json(payload);
    return;
  }

  next();
};
