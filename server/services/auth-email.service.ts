import type { OneTimeTokenType } from '../models/OneTimeToken.ts';
import { getEnv, getPublicAppOrigin } from '../config/env.ts';
import {
  sendMagicLinkEmail as deliverMagicLinkEmail,
  sendPasswordResetEmail as deliverPasswordResetEmail,
  sendSuspiciousLoginEmail as deliverSuspiciousLoginEmail,
  sendVerificationEmail as deliverVerificationEmail,
} from './email/gmailService.ts';
import { OneTimeTokenService } from './one-time-token.service.ts';
import { logger } from '../utils/logger.ts';
import { serviceUnavailable } from '../utils/http-error.ts';

interface AuthEmailDependencies {
  deliverVerificationEmail: typeof deliverVerificationEmail;
  deliverPasswordResetEmail: typeof deliverPasswordResetEmail;
  deliverMagicLinkEmail: typeof deliverMagicLinkEmail;
  deliverSuspiciousLoginEmail: typeof deliverSuspiciousLoginEmail;
}

const defaultDependencies: AuthEmailDependencies = {
  deliverVerificationEmail,
  deliverPasswordResetEmail,
  deliverMagicLinkEmail,
  deliverSuspiciousLoginEmail,
};

const authEmailDependencies: AuthEmailDependencies = {
  ...defaultDependencies,
};

function createAbsoluteUrl(path: string): string {
  return new URL(path, getPublicAppOrigin()).toString();
}

async function rollbackIssuedToken(type: OneTimeTokenType, token: string): Promise<void> {
  try {
    await OneTimeTokenService.revoke(type, token);
  } catch (error) {
    logger.error('auth_email.token_rollback_failed', {
      emailType: type,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

async function issueTokenAndDeliver(params: {
  userId: string;
  email: string;
  type: OneTimeTokenType;
  expiresAt: Date;
  actionPath: (token: string) => string;
  metadata?: Record<string, unknown>;
  deliver: (params: { to: string; actionUrl: string }) => Promise<void>;
}): Promise<string> {
  await OneTimeTokenService.revokeActiveTokensForUser(params.userId, [params.type]);
  const token = await OneTimeTokenService.create({
    userId: params.userId,
    type: params.type,
    expiresAt: params.expiresAt,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
  const actionUrl = createAbsoluteUrl(params.actionPath(token));

  try {
    await params.deliver({
      to: params.email,
      actionUrl,
    });
    return actionUrl;
  } catch (error) {
    await rollbackIssuedToken(params.type, token);
    throw serviceUnavailable('Unable to send the requested email right now', 'EMAIL_DELIVERY_FAILED', {
      emailType: params.type,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export class AuthEmailService {
  static async sendVerificationEmail(userId: string, email: string): Promise<string> {
    return issueTokenAndDeliver({
      userId,
      email,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + (getEnv().AUTH_EMAIL_VERIFY_TTL_SECONDS * 1000)),
      actionPath: (token) => `/auth/verify-email?token=${encodeURIComponent(token)}`,
      deliver: async ({ to, actionUrl }) => {
        await authEmailDependencies.deliverVerificationEmail({
          to,
          verificationUrl: actionUrl,
        });
      },
    });
  }

  static async sendPasswordResetEmail(userId: string, email: string): Promise<string> {
    return issueTokenAndDeliver({
      userId,
      email,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + (getEnv().AUTH_PASSWORD_RESET_TTL_SECONDS * 1000)),
      actionPath: (token) => `/auth/reset-password?token=${encodeURIComponent(token)}`,
      deliver: async ({ to, actionUrl }) => {
        await authEmailDependencies.deliverPasswordResetEmail({
          to,
          resetUrl: actionUrl,
        });
      },
    });
  }

  static async sendMagicLinkEmail(userId: string, email: string, redirectTo?: string): Promise<string> {
    return issueTokenAndDeliver({
      userId,
      email,
      type: 'magic_link',
      expiresAt: new Date(Date.now() + (getEnv().AUTH_MAGIC_LINK_TTL_SECONDS * 1000)),
      actionPath: (token) => `/auth/magic-link?token=${encodeURIComponent(token)}`,
      ...(redirectTo ? { metadata: { redirectTo } } : {}),
      deliver: async ({ to, actionUrl }) => {
        await authEmailDependencies.deliverMagicLinkEmail({
          to,
          magicLinkUrl: actionUrl,
        });
      },
    });
  }

  static async sendSuspiciousLoginEmail(userId: string, email: string): Promise<string> {
    return issueTokenAndDeliver({
      userId,
      email,
      type: 'suspicious_login',
      expiresAt: new Date(Date.now() + (getEnv().AUTH_SUSPICIOUS_LOGIN_TTL_SECONDS * 1000)),
      actionPath: (token) => `/auth/approve-login?token=${encodeURIComponent(token)}`,
      deliver: async ({ to, actionUrl }) => {
        await authEmailDependencies.deliverSuspiciousLoginEmail({
          to,
          approvalUrl: actionUrl,
        });
      },
    });
  }
}

export function setAuthEmailDependenciesForTests(overrides: Partial<AuthEmailDependencies>): void {
  Object.assign(authEmailDependencies, overrides);
}

export function resetAuthEmailDependenciesForTests(): void {
  Object.assign(authEmailDependencies, defaultDependencies);
}
