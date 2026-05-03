import type { Request, Response } from 'express';

import type { IUser } from '../models/User.ts';
import {
  getAuthCookieClearOptions,
  getAuthCookieName,
  getAuthCookieOptions,
  getDeviceCookieClearOptions,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getRefreshCookieName,
  getRefreshCookieClearOptions,
  getRefreshCookieOptions,
} from '../config/cookies.ts';
import { getEnv, getPublicAppOrigin } from '../config/env.ts';
import { applyClearSiteDataHeaders, applyNoStoreHeaders } from '../http/cache-policy.ts';
import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeAuthState, serializeSessionListItem } from '../serializers/api.ts';
import { cleanUsername, normalizeEmail } from '../services/auth-identity.service.ts';
import { AuthMfaService } from '../services/auth-mfa.service.ts';
import { AuthSessionService } from '../services/auth-session.service.ts';
import { sendEmail } from '../services/email.service.ts';
import { GoogleOAuthService } from '../services/google-oauth.service.ts';
import { OneTimeTokenService } from '../services/one-time-token.service.ts';
import { assertValidPassword } from '../services/password-policy.service.ts';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../services/password-hash.service.ts';
import { verifyTurnstileToken } from '../services/auth-turnstile.service.ts';
import { UserService } from '../services/user.service.ts';
import { badRequest, conflict, serviceUnavailable, unauthorized } from '../utils/http-error.ts';
import type {
  CompleteProfileRequest,
  ConsumeMagicLinkRequest,
  ConsumeSuspiciousLoginRequest,
  ConsumeVerificationEmailRequest,
  EmailVerificationResendRequest,
  ForgotPasswordRequest,
  LoginPasswordRequest,
  MagicLinkRequest,
  MfaChallengeRequest,
  MfaDisableRequest,
  MfaTotpVerifyRequest,
  PasswordResetRequest,
  RegisterRequest,
} from '../validation/request-schemas.ts';

function getRequestMetadata(req: Request) {
  return {
    deviceId: AuthSessionService.ensureDeviceId(req.cookies?.[getDeviceCookieName()]),
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  };
}

function sanitizeRedirectPath(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return undefined;
  }

  return trimmed;
}

function createAbsoluteUrl(path: string): string {
  return new URL(path, getPublicAppOrigin()).toString();
}

function buildPostAuthRedirect(username?: string | null): string {
  return username && username.trim().length > 0 ? '/play' : '/auth/complete-profile';
}

function buildPendingEmailVerificationRedirect(email?: string): string {
  const search = new URLSearchParams();
  if (email) {
    search.set('email', email);
  }

  const query = search.toString();
  return query ? `/auth/verify-email?${query}` : '/auth/verify-email';
}

function buildMagicLinkPendingRedirect(email?: string): string {
  const search = new URLSearchParams();
  if (email) {
    search.set('email', email);
  }

  const query = search.toString();
  return query ? `/auth/magic-link?${query}` : '/auth/magic-link';
}

function buildSuspiciousLoginRedirect(email?: string): string {
  const search = new URLSearchParams();
  if (email) {
    search.set('email', email);
  }

  const query = search.toString();
  return query ? `/auth/approve-login?${query}` : '/auth/approve-login';
}

function applySessionCookies(
  res: Response,
  issuedSession: {
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  },
): void {
  res.cookie(getAuthCookieName(), issuedSession.accessToken, getAuthCookieOptions());
  res.cookie(getRefreshCookieName(), issuedSession.refreshToken, getRefreshCookieOptions());
  res.cookie(getDeviceCookieName(), issuedSession.deviceId, getDeviceCookieOptions());
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(getAuthCookieName(), getAuthCookieClearOptions());
  res.clearCookie(getRefreshCookieName(), getRefreshCookieClearOptions());
  res.clearCookie(getDeviceCookieName(), getDeviceCookieClearOptions());
}

async function respondWithIssuedSession(params: {
  req: Request;
  res: Response;
  user: IUser;
  redirectTo: string;
}): Promise<void> {
  const issuedSession = await AuthSessionService.createSession({
    user: params.user,
    metadata: getRequestMetadata(params.req),
  });
  applySessionCookies(params.res, issuedSession);

  const balance = await UserService.getDisplayBalance(params.user._id.toString());
  params.res.json({
    ...serializeAuthState({
      status: typeof params.user.username === 'string' && params.user.username.trim().length > 0
        ? 'authenticated'
        : 'profile_incomplete',
      user: params.user,
      balance,
      session: issuedSession.session,
      nextStep: params.user.username ? undefined : 'complete_profile',
    }),
    redirectTo: params.redirectTo,
  });
}

async function buildAuthState(userId: string, sessionId?: string) {
  const user = await UserService.findAuthUserById(userId);
  if (!user) {
    throw unauthorized('Session expired', 'SESSION_EXPIRED');
  }

  const balance = await UserService.getDisplayBalance(userId);
  const sessionDocument = sessionId
    ? (await AuthSessionService.listSessions(userId, sessionId)).find((entry) => entry.id === sessionId)
    : undefined;

  return {
    user,
    balance,
    sessionDocument,
  };
}

async function sendVerificationEmail(userId: string, email: string): Promise<string> {
  await OneTimeTokenService.revokeActiveTokensForUser(userId, ['email_verification']);
  const token = await OneTimeTokenService.create({
    userId,
    type: 'email_verification',
    expiresAt: new Date(Date.now() + (getEnv().AUTH_EMAIL_VERIFY_TTL_SECONDS * 1000)),
  });
  const verificationUrl = createAbsoluteUrl(`/auth/verify-email?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to: email,
    subject: 'Verify your 4real account',
    text: [
      'Verify your 4real email address to activate your account.',
      '',
      verificationUrl,
    ].join('\n'),
  });

  return verificationUrl;
}

async function sendPasswordResetEmail(userId: string, email: string): Promise<string> {
  await OneTimeTokenService.revokeActiveTokensForUser(userId, ['password_reset']);
  const token = await OneTimeTokenService.create({
    userId,
    type: 'password_reset',
    expiresAt: new Date(Date.now() + (getEnv().AUTH_PASSWORD_RESET_TTL_SECONDS * 1000)),
  });
  const resetUrl = createAbsoluteUrl(`/auth/reset-password?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to: email,
    subject: 'Reset your 4real password',
    text: [
      'Use the link below to reset your 4real password.',
      '',
      resetUrl,
    ].join('\n'),
  });

  return resetUrl;
}

async function sendMagicLinkEmail(userId: string, email: string, redirectTo?: string): Promise<string> {
  await OneTimeTokenService.revokeActiveTokensForUser(userId, ['magic_link']);
  const token = await OneTimeTokenService.create({
    userId,
    type: 'magic_link',
    expiresAt: new Date(Date.now() + (getEnv().AUTH_MAGIC_LINK_TTL_SECONDS * 1000)),
    ...(redirectTo ? { metadata: { redirectTo } } : {}),
  });
  const magicLinkUrl = createAbsoluteUrl(`/auth/magic-link?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to: email,
    subject: 'Your 4real magic sign-in link',
    text: [
      'Use the link below to sign in to 4real.',
      '',
      magicLinkUrl,
    ].join('\n'),
  });

  return magicLinkUrl;
}

async function sendSuspiciousLoginEmail(userId: string, email: string): Promise<string> {
  await OneTimeTokenService.revokeActiveTokensForUser(userId, ['suspicious_login']);
  const token = await OneTimeTokenService.create({
    userId,
    type: 'suspicious_login',
    expiresAt: new Date(Date.now() + (getEnv().AUTH_SUSPICIOUS_LOGIN_TTL_SECONDS * 1000)),
  });
  const approvalUrl = createAbsoluteUrl(`/auth/approve-login?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to: email,
    subject: 'Approve your 4real sign-in',
    text: [
      'We blocked a sign-in from a new device. Approve it with the link below.',
      '',
      approvalUrl,
    ].join('\n'),
  });

  return approvalUrl;
}

function maybeIncludePreviewUrl(url: string) {
  return getEnv().NODE_ENV === 'production' ? {} : { previewUrl: url };
}

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    const body = req.body as RegisterRequest;
    await verifyTurnstileToken(body.turnstileToken, req.ip);

    const email = normalizeEmail(body.email);
    const username = cleanUsername(body.username);
    assertValidPassword(body.password, { email, username });

    const [existingUser, existingUsername] = await Promise.all([
      UserService.findByEmail(email),
      UserService.findByUsername(username),
    ]);

    if (existingUsername) {
      throw conflict('Username already exists', 'USERNAME_ALREADY_EXISTS', { field: 'username' });
    }

    if (existingUser) {
      if (!existingUser.emailVerifiedAt) {
        const verificationUrl = await sendVerificationEmail(existingUser._id.toString(), existingUser.email);
        res.status(202).json({
          status: 'pending_email_verification',
          message: 'Verify your email to continue.',
          email: existingUser.email,
          redirectTo: buildPendingEmailVerificationRedirect(existingUser.email),
          ...maybeIncludePreviewUrl(verificationUrl),
        });
        return;
      }

      throw conflict('Email already exists', 'EMAIL_ALREADY_EXISTS', { field: 'email' });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await UserService.createUser({
      username,
      email,
      passwordHash,
    });

    const verificationUrl = await sendVerificationEmail(user._id.toString(), user.email);
    res.status(202).json({
      status: 'pending_email_verification',
      message: 'Verify your email to continue.',
      email: user.email,
      redirectTo: buildPendingEmailVerificationRedirect(user.email),
      ...maybeIncludePreviewUrl(verificationUrl),
    });
  }

  static async loginPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as LoginPasswordRequest;
    await verifyTurnstileToken(body.turnstileToken, req.ip);

    const email = normalizeEmail(body.email);
    const user = await UserService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await verifyPassword(body.password, user.passwordHash);
    if (!passwordMatches) {
      throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (needsPasswordRehash(user.passwordHash)) {
      void hashPassword(body.password)
        .then((nextHash) => UserService.setPasswordHash(user._id.toString(), nextHash))
        .catch(() => undefined);
    }

    if (!user.emailVerifiedAt) {
      const verificationUrl = await sendVerificationEmail(user._id.toString(), user.email);
      res.status(202).json({
        status: 'pending_email_verification',
        message: 'Verify your email to continue.',
        email: user.email,
        redirectTo: buildPendingEmailVerificationRedirect(user.email),
        ...maybeIncludePreviewUrl(verificationUrl),
      });
      return;
    }

    const metadata = getRequestMetadata(req);
    const suspicious = await AuthSessionService.isSuspiciousLogin(user._id.toString(), metadata.deviceId);
    if (suspicious) {
      if (user.mfa?.enabledAt) {
        const challengeId = await AuthMfaService.createChallenge({
          userId: user._id.toString(),
          mode: 'login',
          deviceId: metadata.deviceId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        });
        res.status(202).json({
          status: 'requires_mfa',
          message: 'Verify your sign-in to continue.',
          challengeId,
          challengeReason: 'suspicious_login',
          nextStep: 'mfa_challenge',
        });
        return;
      }

      const approvalUrl = await sendSuspiciousLoginEmail(user._id.toString(), user.email);
      await UserService.updateSecurityLogin({
        userId: user._id.toString(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        suspicious: true,
      });
      res.status(202).json({
        status: 'pending_email_verification',
        message: 'Check your email to approve this sign-in.',
        email: user.email,
        redirectTo: buildSuspiciousLoginRedirect(user.email),
        ...maybeIncludePreviewUrl(approvalUrl),
      });
      return;
    }

    const issuedSession = await AuthSessionService.createSession({
      user,
      metadata,
    });
    applySessionCookies(res, issuedSession);

    const balance = await UserService.getDisplayBalance(user._id.toString());
    res.json(serializeAuthState({
      status: typeof user.username === 'string' && user.username.trim().length > 0 ? 'authenticated' : 'profile_incomplete',
      user,
      balance,
      session: issuedSession.session,
      nextStep: user.username ? undefined : 'complete_profile',
    }));
  }

  static async requestMagicLink(req: Request, res: Response): Promise<void> {
    const body = req.body as MagicLinkRequest;
    await verifyTurnstileToken(body.turnstileToken, req.ip);

    const email = normalizeEmail(body.email);
    const user = await UserService.findByEmail(email);
    if (!user || !user.emailVerifiedAt) {
      res.status(202).json({
        status: 'magic_link_sent',
        message: 'If that email is registered, a sign-in link is on the way.',
        redirectTo: buildMagicLinkPendingRedirect(email),
      });
      return;
    }

    const magicLinkUrl = await sendMagicLinkEmail(
      user._id.toString(),
      user.email,
      sanitizeRedirectPath(body.redirectTo),
    );
    res.status(202).json({
      status: 'magic_link_sent',
      message: 'If that email is registered, a sign-in link is on the way.',
      redirectTo: buildMagicLinkPendingRedirect(email),
      ...maybeIncludePreviewUrl(magicLinkUrl),
    });
  }

  static async consumeMagicLink(req: Request, res: Response): Promise<void> {
    applyNoStoreHeaders(res);
    const body = req.body as ConsumeMagicLinkRequest;
    const token = body.token.trim();
    if (!token) {
      throw badRequest('Token is required', 'TOKEN_REQUIRED');
    }

    const document = await OneTimeTokenService.consume('magic_link', token);
    const user = await UserService.findAuthUserById(document.userId.toString());
    if (!user || !user.emailVerifiedAt) {
      throw unauthorized('This link is invalid or has expired', 'INVALID_OR_EXPIRED_LINK');
    }

    const redirectTo = sanitizeRedirectPath(
      typeof document.metadata?.redirectTo === 'string' ? document.metadata.redirectTo : undefined,
    ) ?? buildPostAuthRedirect(user.username);
    await respondWithIssuedSession({
      req,
      res,
      user,
      redirectTo,
    });
  }

  static async startGoogleOAuth(req: Request, res: Response): Promise<void> {
    const redirectTo = sanitizeRedirectPath(
      typeof req.query.redirectTo === 'string' ? req.query.redirectTo : undefined,
    );
    res.json({
      status: 'success',
      redirectTo: await GoogleOAuthService.createAuthorizationUrl(redirectTo),
    });
  }

  static async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || !code) {
      res.redirect(302, '/auth/login?error=google');
      return;
    }

    try {
      const googleProfile = await GoogleOAuthService.consumeCallback({ state, code });
      let user = await UserService.findByGoogleSubject(googleProfile.googleSubject);

      if (!user) {
        const existingByEmail = await UserService.findByEmail(googleProfile.email);
        if (existingByEmail) {
          user = await UserService.linkGoogleAccount(existingByEmail._id.toString(), googleProfile.googleSubject);
        } else {
          user = await UserService.createUser({
            email: googleProfile.email,
            googleSubject: googleProfile.googleSubject,
            emailVerifiedAt: new Date(),
          });
        }
      }

      if (!user) {
        throw serviceUnavailable('Unable to complete Google sign-in', 'GOOGLE_SIGNIN_FAILED');
      }

      const issuedSession = await AuthSessionService.createSession({
        user,
        metadata: getRequestMetadata(req),
      });
      applySessionCookies(res, issuedSession);

      const redirectTarget = sanitizeRedirectPath(googleProfile.redirectTo)
        ?? buildPostAuthRedirect(user.username);
      res.redirect(302, redirectTarget);
    } catch {
      res.redirect(302, '/auth/login?error=google');
    }
  }

  static async resendVerificationEmail(req: Request, res: Response): Promise<void> {
    const body = req.body as EmailVerificationResendRequest;
    const user = await UserService.findByEmail(body.email);
    if (!user || user.emailVerifiedAt) {
      res.status(202).json({
        status: 'email_verification_sent',
        message: 'If the account exists, a verification email is on the way.',
        redirectTo: buildPendingEmailVerificationRedirect(body.email),
      });
      return;
    }

    const verificationUrl = await sendVerificationEmail(user._id.toString(), user.email);
    res.status(202).json({
      status: 'email_verification_sent',
      message: 'If the account exists, a verification email is on the way.',
      redirectTo: buildPendingEmailVerificationRedirect(user.email),
      ...maybeIncludePreviewUrl(verificationUrl),
    });
  }

  static async consumeVerificationEmail(req: Request, res: Response): Promise<void> {
    applyNoStoreHeaders(res);
    const body = req.body as ConsumeVerificationEmailRequest;
    const token = body.token.trim();
    if (!token) {
      throw badRequest('Token is required', 'TOKEN_REQUIRED');
    }

    const document = await OneTimeTokenService.consume('email_verification', token);
    const user = await UserService.markEmailVerified(document.userId.toString());
    if (!user) {
      throw unauthorized('This link is invalid or has expired', 'INVALID_OR_EXPIRED_LINK');
    }

    await respondWithIssuedSession({
      req,
      res,
      user,
      redirectTo: '/auth/verified',
    });
  }

  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    const body = req.body as ForgotPasswordRequest;
    await verifyTurnstileToken(body.turnstileToken, req.ip);

    const user = await UserService.findByEmail(body.email);
    if (!user || !user.emailVerifiedAt) {
      res.status(202).json({
        status: 'password_reset_requested',
        message: 'If the account exists, a reset email is on the way.',
      });
      return;
    }

    const previewUrl = await sendPasswordResetEmail(user._id.toString(), user.email);
    res.status(202).json({
      status: 'password_reset_requested',
      message: 'If the account exists, a reset email is on the way.',
      ...maybeIncludePreviewUrl(previewUrl),
    });
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as PasswordResetRequest;
    assertValidPassword(body.password);

    const document = await OneTimeTokenService.consume('password_reset', body.token);
    const user = await UserService.findAuthUserById(document.userId.toString());
    if (!user) {
      throw unauthorized('This link is invalid or has expired', 'INVALID_OR_EXPIRED_LINK');
    }

    const passwordHash = await hashPassword(body.password);
    await UserService.setPasswordHash(user._id.toString(), passwordHash);
    await UserService.markEmailVerified(user._id.toString());
    await AuthSessionService.revokeAllSessionsForUser(user._id.toString(), 'password_reset');

    res.json({
      status: 'password_reset_complete',
      message: 'Your password has been reset. Sign in again to continue.',
    });
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const user = await UserService.findAuthUserById(req.user.id);
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const sessionList = await AuthSessionService.listSessions(req.user.id, req.user.sessionId);
    const balance = await UserService.getDisplayBalance(req.user.id);

    res.json({
      ...serializeAuthState({
        status: req.user.usernameComplete ? 'authenticated' : 'profile_incomplete',
        user,
        balance,
        nextStep: req.user.usernameComplete ? undefined : 'complete_profile',
      }),
      session: sessionList.find((entry) => entry.current),
    });
  }

  static async refreshSession(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.[getRefreshCookieName()];
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw unauthorized('Refresh token required', 'UNAUTHENTICATED');
    }

    const issuedSession = await AuthSessionService.refreshSession({
      refreshToken,
      metadata: getRequestMetadata(req),
    });
    applySessionCookies(res, issuedSession);

    const user = await UserService.findAuthUserById(issuedSession.session.userId.toString());
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const balance = await UserService.getDisplayBalance(user._id.toString());
    res.json(serializeAuthState({
      status: user.username ? 'authenticated' : 'profile_incomplete',
      user,
      balance,
      session: issuedSession.session,
      nextStep: user.username ? undefined : 'complete_profile',
    }));
  }

  static async logout(req: Request, res: Response): Promise<void> {
    await AuthSessionService.logoutFromTokens({
      accessToken: typeof req.cookies?.[getAuthCookieName()] === 'string' ? req.cookies[getAuthCookieName()] : null,
      refreshToken: typeof req.cookies?.[getRefreshCookieName()] === 'string'
        ? req.cookies[getRefreshCookieName()]
        : null,
    });

    clearSessionCookies(res);
    applyClearSiteDataHeaders(res);
    res.status(204).send();
  }

  static async listSessions(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    res.json({
      status: 'success',
      sessions: await AuthSessionService.listSessions(req.user.id, req.user.sessionId),
    });
  }

  static async revokeSession(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      throw badRequest('Session id is required', 'SESSION_ID_REQUIRED');
    }

    await AuthSessionService.revokeSession(sessionId, 'user_session_revoked');
    if (sessionId === req.user.sessionId) {
      clearSessionCookies(res);
      applyClearSiteDataHeaders(res);
    }

    res.json({
      status: 'sessions_revoked',
      message: 'Session revoked.',
      sessions: await AuthSessionService.listSessions(req.user.id, req.user.sessionId),
    });
  }

  static async revokeOtherSessions(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    await AuthSessionService.revokeOtherSessionsForUser(req.user.id, req.user.sessionId);
    res.json({
      status: 'sessions_revoked',
      message: 'Other sessions revoked.',
      sessions: await AuthSessionService.listSessions(req.user.id, req.user.sessionId),
    });
  }

  static async startTotpSetup(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const user = await UserService.findAuthUserById(req.user.id);
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const setup = await AuthMfaService.createSetup(user);
    res.json({
      status: 'success',
      message: 'Scan the secret with your authenticator app.',
      setupToken: setup.setupToken,
      totpSecret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
    });
  }

  static async verifyTotpSetup(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const body = req.body as MfaTotpVerifyRequest;
    const user = await UserService.findAuthUserById(req.user.id);
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const recoveryCodes = await AuthMfaService.verifySetup(user, body.setupToken, body.code);
    const updatedUser = await UserService.findAuthUserById(req.user.id);
    if (!updatedUser) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const balance = await UserService.getDisplayBalance(req.user.id);
    res.json({
      ...serializeAuthState({
        status: 'mfa_enabled',
        user: updatedUser,
        balance,
        message: 'MFA enabled.',
      }),
      recoveryCodes,
    });
  }

  static async completeMfaChallenge(req: Request, res: Response): Promise<void> {
    const body = req.body as MfaChallengeRequest;
    const challenge = await AuthMfaService.consumeChallenge(body.challengeId);
    const user = await UserService.findAuthUserById(challenge.userId);
    if (!user) {
      throw unauthorized('MFA challenge expired', 'MFA_CHALLENGE_EXPIRED');
    }

    await AuthMfaService.verifyUserFactor(user, {
      code: body.code,
      recoveryCode: body.recoveryCode,
    });

    if (challenge.mode === 'login') {
      const issuedSession = await AuthSessionService.createSession({
        user,
        metadata: {
          deviceId: AuthSessionService.ensureDeviceId(challenge.deviceId),
          ipAddress: challenge.ipAddress ?? null,
          userAgent: challenge.userAgent ?? null,
        },
      });
      applySessionCookies(res, issuedSession);

      const balance = await UserService.getDisplayBalance(user._id.toString());
      res.json(serializeAuthState({
        status: user.username ? 'authenticated' : 'profile_incomplete',
        user,
        balance,
        session: issuedSession.session,
        nextStep: user.username ? undefined : 'complete_profile',
      }));
      return;
    }

    if (!challenge.sessionId) {
      throw unauthorized('MFA challenge expired', 'MFA_CHALLENGE_EXPIRED');
    }

    const expiresAt = await AuthSessionService.establishMfaStepUp(challenge.sessionId);
    res.json({
      status: 'success',
      message: 'Verification complete.',
      session: {
        id: challenge.sessionId,
        deviceId: '',
        current: true,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        idleExpiresAt: expiresAt.toISOString(),
        absoluteExpiresAt: expiresAt.toISOString(),
      },
    });
  }

  static async disableMfa(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const body = req.body as MfaDisableRequest;
    const user = await UserService.findAuthUserById(req.user.id);
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    await AuthMfaService.verifyUserFactor(user, {
      code: body.code,
      recoveryCode: body.recoveryCode,
    });
    await AuthMfaService.disableMfa(user);
    await AuthSessionService.clearMfaStepUp(req.user.sessionId);

    const updatedUser = await UserService.findAuthUserById(req.user.id);
    if (!updatedUser) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const balance = await UserService.getDisplayBalance(req.user.id);
    res.json(serializeAuthState({
      status: 'mfa_disabled',
      user: updatedUser,
      balance,
      message: 'MFA disabled.',
    }));
  }

  static async regenerateRecoveryCodes(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const user = await UserService.findAuthUserById(req.user.id);
    if (!user) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const recoveryCodes = await AuthMfaService.regenerateRecoveryCodes(user);
    const updatedUser = await UserService.findAuthUserById(req.user.id);
    if (!updatedUser) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const balance = await UserService.getDisplayBalance(req.user.id);
    res.json({
      ...serializeAuthState({
        status: 'success',
        user: updatedUser,
        balance,
        message: 'Recovery codes regenerated.',
      }),
      recoveryCodes,
    });
  }

  static async completeProfile(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const body = req.body as CompleteProfileRequest;
    const updatedUser = await UserService.setUsername(req.user.id, body.username);
    if (!updatedUser) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const balance = await UserService.getDisplayBalance(req.user.id);
    res.json(serializeAuthState({
      status: 'authenticated',
      user: updatedUser,
      balance,
      message: 'Profile completed.',
    }));
  }

  static async consumeSuspiciousLogin(req: Request, res: Response): Promise<void> {
    applyNoStoreHeaders(res);
    const body = req.body as ConsumeSuspiciousLoginRequest;
    const token = body.token.trim();
    if (!token) {
      throw badRequest('Token is required', 'TOKEN_REQUIRED');
    }

    const document = await OneTimeTokenService.consume('suspicious_login', token);
    const user = await UserService.findAuthUserById(document.userId.toString());
    if (!user || !user.emailVerifiedAt) {
      throw unauthorized('This link is invalid or has expired', 'INVALID_OR_EXPIRED_LINK');
    }

    await respondWithIssuedSession({
      req,
      res,
      user,
      redirectTo: buildPostAuthRedirect(user.username),
    });
  }
}
