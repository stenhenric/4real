import type { Request, Response, NextFunction } from 'express';
import { getJwtSecret } from '../config/config.ts';
import type { JwtUser } from '../types/api';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: JwtUser;
  cookies?: { token?: string };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, getJwtSecret(), (err: jwt.VerifyErrors | null, user: string | jwt.JwtPayload | undefined) => {
    if (err) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    if (!user || typeof user === 'string' || !('id' in user) || !('isAdmin' in user)) {
      res.status(403).json({ error: 'Invalid token payload' });
      return;
    }
    req.user = { id: String(user.id), isAdmin: Boolean(user.isAdmin) };
    next();
  });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
