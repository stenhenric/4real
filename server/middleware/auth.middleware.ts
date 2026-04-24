import type { Request, Response, NextFunction } from 'express';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { verifyAuthToken } from '../services/auth-token.service.ts';
import type { JwtUser } from '../types/api.ts';

export interface AuthRequest extends Request {
  user?: JwtUser;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  void verifyAuthToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((error) => {
      const message = error instanceof Error && error.message === 'Invalid token payload'
        ? 'Invalid token payload'
        : 'Invalid token';
      res.status(403).json({ error: message });
    });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};
