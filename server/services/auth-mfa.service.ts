import crypto from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { createRecoveryCode, decryptSecret, encryptSecret, hashOpaqueToken } from './auth-crypto.service.ts';
import { AuditService } from './audit.service.ts';
import { ProductEmailNotificationService } from './product-email-notification.service.ts';
import { getRedisClient } from './redis.service.ts';
import { createTotpSetup, verifyTotpCode } from './totp.service.ts';
import type { IUser } from '../models/User.ts';
import { unauthorized } from '../utils/http-error.ts';
import { logger } from '../utils/logger.ts';
import { UserService } from './user.service.ts';

const MFA_SETUP_PREFIX = 'auth:mfa:setup:';
const MFA_CHALLENGE_PREFIX = 'auth:mfa:challenge:';
const MFA_SETUP_TTL_SECONDS = 10 * 60;
const ATOMIC_GET_DELETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  redis.call('DEL', KEYS[1])
end
return raw
`;

interface StoredMfaSetup {
  userId: string;
  secret: string;
}

interface StoredMfaChallenge {
  userId: string;
  mode: 'login' | 'stepup' | 'withdrawal';
  sessionId?: string;
  deviceId?: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
  redirectTo?: string;
  withdrawalIntentId?: string;
}

function getMfaSetupKey(setupToken: string): string {
  return `${MFA_SETUP_PREFIX}${setupToken}`;
}

function getMfaChallengeKey(challengeId: string): string {
  return `${MFA_CHALLENGE_PREFIX}${challengeId}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

function hashRecoveryCode(code: string): string {
  return hashOpaqueToken(normalizeRecoveryCode(code));
}

async function readJsonRecord<T>(key: string): Promise<T | null> {
  const value = await getRedisClient().get(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function consumeJsonRecord<T>(key: string): Promise<T | null> {
  const value = await getRedisClient().eval(ATOMIC_GET_DELETE_SCRIPT, 1, key);
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class AuthMfaService {
  static async createSetup(user: IUser) {
    const setupToken = crypto.randomUUID();
    const setup = createTotpSetup({
      issuer: '4real',
      accountName: user.email,
    });

    const payload: StoredMfaSetup = {
      userId: user._id.toString(),
      secret: setup.secret,
    };

    await getRedisClient().setex(
      getMfaSetupKey(setupToken),
      MFA_SETUP_TTL_SECONDS,
      JSON.stringify(payload),
    );

    return {
      setupToken,
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
    };
  }

  static async verifySetup(user: IUser, setupToken: string, code: string) {
    const payload = await readJsonRecord<StoredMfaSetup>(getMfaSetupKey(setupToken));
    if (!payload || payload.userId !== user._id.toString()) {
      throw unauthorized('MFA setup session expired', 'MFA_SETUP_EXPIRED');
    }

    if (!verifyTotpCode(payload.secret, code)) {
      throw unauthorized('Invalid verification code', 'INVALID_TOTP_CODE');
    }

    await getRedisClient().del(getMfaSetupKey(setupToken));

    const recoveryCodes = Array.from({ length: 10 }, () => createRecoveryCode());
    await UserService.updateMfaState({
      userId: user._id.toString(),
      totpSecretEncrypted: encryptSecret(payload.secret),
      enabledAt: new Date(),
      recoveryCodeHashes: recoveryCodes.map((entry) => hashRecoveryCode(entry)),
    });

    return recoveryCodes;
  }

  static async createChallenge(params: StoredMfaChallenge): Promise<string> {
    const challengeId = crypto.randomUUID();
    await getRedisClient().setex(
      getMfaChallengeKey(challengeId),
      getEnv().AUTH_SUSPICIOUS_LOGIN_TTL_SECONDS,
      JSON.stringify(params),
    );
    return challengeId;
  }

  static async consumeChallenge(challengeId: string): Promise<StoredMfaChallenge> {
    const key = getMfaChallengeKey(challengeId);
    const payload = await consumeJsonRecord<StoredMfaChallenge>(key);
    if (!payload) {
      throw unauthorized('MFA challenge expired', 'MFA_CHALLENGE_EXPIRED');
    }

    return payload;
  }

  static async verifyUserFactor(user: IUser, params: { code: string | undefined; recoveryCode: string | undefined }): Promise<IUser> {
    if (!user.mfa?.enabledAt || !user.mfa?.totpSecretEncrypted) {
      throw unauthorized('MFA is not enabled for this account', 'MFA_NOT_ENABLED');
    }

    if (params.code && verifyTotpCode(decryptSecret(user.mfa.totpSecretEncrypted), params.code)) {
      return user;
    }

    if (params.recoveryCode) {
      const recoveryHash = hashRecoveryCode(params.recoveryCode);
      const updatedUser = await UserService.consumeMfaRecoveryCode({
        userId: user._id.toString(),
        recoveryCodeHash: recoveryHash,
      });
      if (updatedUser) {
        return updatedUser;
      }
    }

    throw unauthorized('Invalid verification code', 'INVALID_TOTP_CODE');
  }

  static async disableMfa(user: IUser): Promise<void> {
    await UserService.updateMfaState({
      userId: user._id.toString(),
      totpSecretEncrypted: null,
      enabledAt: null,
      recoveryCodeHashes: [],
    });
  }

  static async regenerateRecoveryCodes(user: IUser, options: { actorUserId?: string | null } = {}): Promise<string[]> {
    if (!user.mfa?.enabledAt || !user.mfa?.totpSecretEncrypted) {
      throw unauthorized('MFA is not enabled for this account', 'MFA_NOT_ENABLED');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => createRecoveryCode());
    await UserService.updateMfaState({
      userId: user._id.toString(),
      totpSecretEncrypted: user.mfa.totpSecretEncrypted,
      enabledAt: user.mfa.enabledAt,
      recoveryCodeHashes: recoveryCodes.map((entry) => hashRecoveryCode(entry)),
    });
    try {
      await AuditService.record({
        eventType: 'mfa_recovery_codes_regenerated',
        actorUserId: options.actorUserId ?? user._id.toString(),
        targetUserId: user._id.toString(),
        resourceType: 'user',
        resourceId: user._id.toString(),
      });
    } catch (error) {
      logger.error('mfa_recovery_codes.audit_post_update_failed', {
        userId: user._id.toString(),
        error,
      });
    }
    await ProductEmailNotificationService.sendSecurityAlert({
      userId: user._id.toString(),
      subject: 'Your 4real recovery codes were regenerated',
      summary: 'Your MFA recovery codes were regenerated. If this was not you, reset your password and review your active sessions.',
    });
    return recoveryCodes;
  }
}
