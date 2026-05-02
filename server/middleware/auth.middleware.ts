import type { Request, Response, NextFunction } from 'express';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { assignTraceContext } from '../services/trace-context.service.ts';
import { verifyAuthToken } from '../services/auth-token.service.ts';
import type { JwtUser } from '../types/api.ts';
import { forbidden, unauthorized } from '../utils/http-error.ts';

export interface AuthRequest extends Request {
  user?: JwtUser;
}

export interface AuthenticatedRequest extends AuthRequest {
  user: JwtUser;
}

export function assertAuthenticated(req: AuthRequest): asserts req is AuthenticatedRequest {
  if (!req.user?.id) {
    throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
  }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    next(unauthorized('Access token required', 'UNAUTHENTICATED'));
    return;
  }

  void verifyAuthToken(token)
    .then((user) => {
      req.user = user;
      assignTraceContext({ userId: user.id });
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        next(error);
        return;
      }

      next(unauthorized('Invalid token', 'INVALID_TOKEN'));
    });
};

export const requireAdmin = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    next(forbidden('Admin access required', 'ADMIN_ACCESS_REQUIRED'));
    return;
  }

  next();
};
