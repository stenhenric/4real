import crypto from 'node:crypto';

import { AuthSession } from '../models/AuthSession.ts';
import type { IAuthSession } from '../models/AuthSession.ts';
import type { IUser } from '../models/User.ts';
import { getEnv } from '../config/env.ts';
import { getRedisClient } from './redis.service.ts';
import { createOpaqueToken, hashOpaqueToken } from './auth-crypto.service.ts';
import { unauthorized } from '../utils/http-error.ts';
import { UserService } from './user.service.ts';

const ACCESS_KEY_PREFIX = 'auth:access:';
const USED_REFRESH_KEY_PREFIX = 'auth:refresh:used:';
const MFA_STEPUP_KEY_PREFIX = 'auth:stepup:';

export interface AuthenticatedPrincipal {
  id: string;
  isAdmin: boolean;
  sessionId: string;
  deviceId: string;
  emailVerified: boolean;
  usernameComplete: boolean;
  mfaEnabled: boolean;
}

export interface AuthenticatedSessionContext {
  principal: AuthenticatedPrincipal;
  session: IAuthSession;
  user: IUser;
}

interface SessionRequestMetadata {
  deviceId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IssuedSessionResult {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  session: IAuthSession;
}

function getAccessRedisKey(hash: string): string {
  return `${ACCESS_KEY_PREFIX}${hash}`;
}

function getUsedRefreshRedisKey(hash: string): string {
  return `${USED_REFRESH_KEY_PREFIX}${hash}`;
}

function getMfaStepUpRedisKey(sessionId: string): string {
  return `${MFA_STEPUP_KEY_PREFIX}${sessionId}`;
}

function getAbsoluteExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + (getEnv().AUTH_SESSION_ABSOLUTE_TTL_SECONDS * 1000));
}

function getIdleExpiryDate(from = new Date(), absoluteExpiryDate?: Date): Date {
  const candidate = new Date(from.getTime() + (getEnv().AUTH_REFRESH_IDLE_TTL_SECONDS * 1000));
  if (!absoluteExpiryDate) {
    return candidate;
  }

  return candidate.getTime() <= absoluteExpiryDate.getTime() ? candidate : absoluteExpiryDate;
}

function getTtlSeconds(targetDate: Date): number {
  return Math.max(1, Math.floor((targetDate.getTime() - Date.now()) / 1000));
}

/**
 * IMPORTANT:
 * Mongoose mutates query objects during casting.
 * NEVER reuse objects returned by this function.
 * Always call inline.
 */
export function buildActiveSessionQuery() {
  const now = Date.now();

  return {
    revokedAt: null,
    absoluteExpiresAt: { $gt: new Date(now) },
    idleExpiresAt: { $gt: new Date(now) },
  };
}

function createAccessRedisPayload(params: {
  userId: string;
  sessionId: string;
  deviceId: string;
}): string {
  return JSON.stringify(params);
}

function parseAccessRedisPayload(value: string | null): {
  userId: string;
  sessionId: string;
  deviceId: string;
} | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { userId?: unknown; sessionId?: unknown; deviceId?: unknown };
    if (
      typeof parsed.userId === 'string'
      && typeof parsed.sessionId === 'string'
      && typeof parsed.deviceId === 'string'
    ) {
      return {
        userId: parsed.userId,
        sessionId: parsed.sessionId,
        deviceId: parsed.deviceId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function setAccessRecord(params: {
  accessTokenHash: string;
  userId: string;
  sessionId: string;
  deviceId: string;
}): Promise<void> {
  await getRedisClient().setex(
    getAccessRedisKey(params.accessTokenHash),
    getEnv().AUTH_ACCESS_TTL_SECONDS,
    createAccessRedisPayload({
      userId: params.userId,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
    }),
  );
}

async function deleteAccessRecord(accessTokenHash?: string | null): Promise<void> {
  if (!accessTokenHash) {
    return;
  }

  await getRedisClient().del(getAccessRedisKey(accessTokenHash));
}

async function markRefreshTokenUsed(params: {
  refreshTokenHash: string;
  userId: string;
  sessionId: string;
  expiresAt: Date;
}): Promise<void> {
  await getRedisClient().setex(
    getUsedRefreshRedisKey(params.refreshTokenHash),
    getTtlSeconds(params.expiresAt),
    JSON.stringify({
      userId: params.userId,
      sessionId: params.sessionId,
    }),
  );
}

async function getRefreshReuseMarker(refreshTokenHash: string): Promise<{ userId: string; sessionId: string } | null> {
  const rawValue = await getRedisClient().get(getUsedRefreshRedisKey(refreshTokenHash));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { userId?: unknown; sessionId?: unknown };
    if (typeof parsed.userId === 'string' && typeof parsed.sessionId === 'string') {
      return {
        userId: parsed.userId,
        sessionId: parsed.sessionId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildPrincipal(params: {
  user: IUser;
  session: IAuthSession;
}): AuthenticatedPrincipal {
  return {
    id: params.user._id.toString(),
    isAdmin: params.user.isAdmin,
    sessionId: params.session.sessionId,
    deviceId: params.session.deviceId,
    emailVerified: params.user.emailVerifiedAt instanceof Date,
    usernameComplete: typeof params.user.username === 'string' && params.user.username.trim().length > 0,
    mfaEnabled: params.user.mfa?.enabledAt instanceof Date,
  };
}

async function revokeSessionDocument(document: IAuthSession, reason: string): Promise<void> {
  await deleteAccessRecord(document.currentAccessTokenHash);
  if (document.currentRefreshTokenHash) {
    await markRefreshTokenUsed({
      refreshTokenHash: document.currentRefreshTokenHash,
      userId: document.userId.toString(),
      sessionId: document.sessionId,
      expiresAt: document.absoluteExpiresAt,
    });
  }

  document.revokedAt = new Date();
  document.revokeReason = reason;
  document.currentAccessTokenHash = null;
  document.currentRefreshTokenHash = null;
  await document.save();
}

export class AuthSessionService {
  static ensureDeviceId(existingValue?: string | null): string {
    if (typeof existingValue === 'string' && existingValue.trim().length >= 16) {
      return existingValue.trim();
    }

    return createOpaqueToken(24);
  }

  static async createSession(params: {
    user: IUser;
    metadata: SessionRequestMetadata;
  }): Promise<IssuedSessionResult> {
    const now = new Date();
    const absoluteExpiresAt = getAbsoluteExpiryDate(now);
    const idleExpiresAt = getIdleExpiryDate(now, absoluteExpiresAt);
    const sessionId = crypto.randomUUID();
    const accessToken = createOpaqueToken();
    const refreshToken = createOpaqueToken();
    const accessTokenHash = hashOpaqueToken(accessToken);
    const refreshTokenHash = hashOpaqueToken(refreshToken);

    const existingSessions = await AuthSession.find({
      userId: params.user._id,
      deviceId: params.metadata.deviceId,
      ...buildActiveSessionQuery(),
    });
    for (const existingSession of existingSessions) {
      await revokeSessionDocument(existingSession, 'device_replaced');
    }

    const session = await AuthSession.create({
      sessionId,
      userId: params.user._id,
      deviceId: params.metadata.deviceId,
      currentAccessTokenHash: accessTokenHash,
      currentRefreshTokenHash: refreshTokenHash,
      absoluteExpiresAt,
      idleExpiresAt,
      lastSeenAt: now,
      lastIp: params.metadata.ipAddress ?? null,
      lastUserAgent: params.metadata.userAgent ?? null,
    });

    await setAccessRecord({
      accessTokenHash,
      userId: params.user._id.toString(),
      sessionId,
      deviceId: params.metadata.deviceId,
    });

    await UserService.updateSecurityLogin({
      userId: params.user._id.toString(),
      ipAddress: params.metadata.ipAddress ?? null,
      userAgent: params.metadata.userAgent ?? null,
    });

    return {
      accessToken,
      refreshToken,
      deviceId: params.metadata.deviceId,
      session,
    };
  }

  static async validateAccessToken(accessToken: string): Promise<AuthenticatedSessionContext> {
    const accessTokenHash = hashOpaqueToken(accessToken);
    const record = parseAccessRedisPayload(await getRedisClient().get(getAccessRedisKey(accessTokenHash)));
    if (!record) {
      throw unauthorized('Access token required', 'UNAUTHENTICATED');
    }

    const session = await AuthSession.findOne({
      sessionId: record.sessionId,
      currentAccessTokenHash: accessTokenHash,
      ...buildActiveSessionQuery(),
    });
    if (!session) {
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    const user = await UserService.findAuthUserById(record.userId);
    if (!user) {
      await revokeSessionDocument(session, 'user_missing');
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    return {
      principal: buildPrincipal({ user, session }),
      session,
      user,
    };
  }

  static async refreshSession(params: {
    refreshToken: string;
    metadata: SessionRequestMetadata;
  }): Promise<IssuedSessionResult> {
    const refreshTokenHash = hashOpaqueToken(params.refreshToken);
    const reuseMarker = await getRefreshReuseMarker(refreshTokenHash);
    if (reuseMarker) {
      await this.revokeAllSessionsForUser(reuseMarker.userId, 'refresh_reuse_detected');
      throw unauthorized('Session replay detected', 'SESSION_REPLAY_DETECTED');
    }

    const session = await AuthSession.findOne({
      currentRefreshTokenHash: refreshTokenHash,
      ...buildActiveSessionQuery(),
    });
    if (!session) {
      throw unauthorized('Refresh token required', 'UNAUTHENTICATED');
    }

    const user = await UserService.findAuthUserById(session.userId.toString());
    if (!user) {
      await revokeSessionDocument(session, 'user_missing');
      throw unauthorized('Session expired', 'SESSION_EXPIRED');
    }

    await markRefreshTokenUsed({
      refreshTokenHash,
      userId: user._id.toString(),
      sessionId: session.sessionId,
      expiresAt: session.absoluteExpiresAt,
    });
    await deleteAccessRecord(session.currentAccessTokenHash);

    const nextAccessToken = createOpaqueToken();
    const nextRefreshToken = createOpaqueToken();
    const nextAccessTokenHash = hashOpaqueToken(nextAccessToken);
    const nextRefreshTokenHash = hashOpaqueToken(nextRefreshToken);
    const now = new Date();

    session.currentAccessTokenHash = nextAccessTokenHash;
    session.currentRefreshTokenHash = nextRefreshTokenHash;
    session.lastSeenAt = now;
    session.lastIp = params.metadata.ipAddress ?? null;
    session.lastUserAgent = params.metadata.userAgent ?? null;
    session.idleExpiresAt = getIdleExpiryDate(now, session.absoluteExpiresAt);
    await session.save();

    await setAccessRecord({
      accessTokenHash: nextAccessTokenHash,
      userId: user._id.toString(),
      sessionId: session.sessionId,
      deviceId: session.deviceId,
    });

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      deviceId: session.deviceId,
      session,
    };
  }

  static async logoutFromTokens(params: {
    accessToken?: string | null;
    refreshToken?: string | null;
  }): Promise<void> {
    let session: IAuthSession | null = null;

    if (params.accessToken) {
      const accessHash = hashOpaqueToken(params.accessToken);
      const accessRecord = parseAccessRedisPayload(await getRedisClient().get(getAccessRedisKey(accessHash)));
      if (accessRecord) {
        session = await AuthSession.findOne({
          sessionId: accessRecord.sessionId,
          currentAccessTokenHash: accessHash,
        });
      }
    }

    if (!session && params.refreshToken) {
      session = await AuthSession.findOne({
        currentRefreshTokenHash: hashOpaqueToken(params.refreshToken),
      });
    }

    if (!session) {
      return;
    }

    await revokeSessionDocument(session, 'logout');
  }

  static async revokeSession(sessionId: string, reason = 'session_revoked'): Promise<boolean> {
    const session = await AuthSession.findOne({
      sessionId,
      ...buildActiveSessionQuery(),
    });
    if (!session) {
      return false;
    }

    await revokeSessionDocument(session, reason);
    return true;
  }

  static async revokeAllSessionsForUser(userId: string, reason = 'all_sessions_revoked'): Promise<void> {
    const sessions = await AuthSession.find({
      userId,
      ...buildActiveSessionQuery(),
    });

    for (const session of sessions) {
      await revokeSessionDocument(session, reason);
    }
  }

  static async revokeOtherSessionsForUser(userId: string, currentSessionId: string): Promise<void> {
    const sessions = await AuthSession.find({
      userId,
      sessionId: { $ne: currentSessionId },
      ...buildActiveSessionQuery(),
    });

    for (const session of sessions) {
      await revokeSessionDocument(session, 'other_sessions_revoked');
    }
  }

  static async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await AuthSession.find({
      userId,
      ...buildActiveSessionQuery(),
    }).sort({ lastSeenAt: -1 });

    return sessions.map((session) => ({
      id: session.sessionId,
      deviceId: session.deviceId,
      current: session.sessionId === currentSessionId,
      userAgent: session.lastUserAgent ?? null,
      ipAddress: session.lastIp ?? null,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      idleExpiresAt: session.idleExpiresAt.toISOString(),
      absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
    }));
  }

  static async isSuspiciousLogin(userId: string, deviceId: string): Promise<boolean> {
    const existingSession = await AuthSession.findOne({
      userId,
      deviceId,
      ...buildActiveSessionQuery(),
    });
    if (existingSession) {
      return false;
    }

    const anotherActiveSession = await AuthSession.exists({
      userId,
      ...buildActiveSessionQuery(),
    });
    return Boolean(anotherActiveSession);
  }

  static async establishMfaStepUp(sessionId: string): Promise<Date> {
    const expiresAt = new Date(Date.now() + (getEnv().AUTH_MFA_STEPUP_TTL_SECONDS * 1000));
    await getRedisClient().setex(
      getMfaStepUpRedisKey(sessionId),
      getEnv().AUTH_MFA_STEPUP_TTL_SECONDS,
      expiresAt.toISOString(),
    );
    return expiresAt;
  }

  static async getMfaStepUpExpiry(sessionId: string): Promise<Date | null> {
    const value = await getRedisClient().get(getMfaStepUpRedisKey(sessionId));
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  static async clearMfaStepUp(sessionId: string): Promise<void> {
    await getRedisClient().del(getMfaStepUpRedisKey(sessionId));
  }
}
