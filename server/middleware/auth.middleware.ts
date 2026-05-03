import type { Request, Response, NextFunction } from 'express';

import { AUTH_COOKIE_NAME } from '../config/cookies.ts';
import { assignTraceContext } from '../services/trace-context.service.ts';
import { AuthMfaService } from '../services/auth-mfa.service.ts';
import { AuthSessionService } from '../services/auth-session.service.ts';
import type { AuthenticatedPrincipalDTO } from '../types/api.ts';
import { forbidden, unauthorized } from '../utils/http-error.ts';

export interface AuthRequest extends Request {
  user?: AuthenticatedPrincipalDTO;
}

export interface AuthenticatedRequest extends AuthRequest {
  user: AuthenticatedPrincipalDTO;
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

  void AuthSessionService.validateAccessToken(token)
    .then((context) => {
      req.user = context.principal;
      assignTraceContext({ userId: context.principal.id });
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

export const requireVerifiedAccount = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (!req.user?.emailVerified) {
    next(forbidden('Verify your email to continue', 'EMAIL_VERIFICATION_REQUIRED', {
      nextStep: 'verify_email',
    }));
    return;
  }

  if (!req.user.usernameComplete) {
    next(forbidden('Complete your profile to continue', 'PROFILE_COMPLETION_REQUIRED', {
      nextStep: 'complete_profile',
    }));
    return;
  }

  next();
};

export const requireMfaStepUp = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(unauthorized('Access token required', 'UNAUTHENTICATED'));
    return;
  }

  if (!req.user.mfaEnabled) {
    next(forbidden('Set up MFA to continue', 'MFA_SETUP_REQUIRED', {
      nextStep: 'setup_mfa',
    }));
    return;
  }

  void AuthSessionService.getMfaStepUpExpiry(req.user.sessionId)
    .then(async (expiresAt) => {
      if (expiresAt && expiresAt.getTime() > Date.now()) {
        next();
        return;
      }

      const challengeId = await AuthMfaService.createChallenge({
        userId: req.user!.id,
        mode: 'stepup',
        sessionId: req.user!.sessionId,
      });
      next(forbidden('Additional verification required', 'MFA_REQUIRED', {
        challengeId,
        nextStep: 'mfa_challenge',
        challengeReason: 'sensitive_action',
      }));
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        next(error);
        return;
      }

      next(forbidden('Additional verification required', 'MFA_REQUIRED'));
    });
};
