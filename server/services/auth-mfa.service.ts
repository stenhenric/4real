import crypto from 'node:crypto';

import { getEnv } from '../config/env.ts';
import { createRecoveryCode, decryptSecret, encryptSecret, hashOpaqueToken } from './auth-crypto.service.ts';
import { getRedisClient } from './redis.service.ts';
import { createTotpSetup, verifyTotpCode } from './totp.service.ts';
import type { IUser } from '../models/User.ts';
import { unauthorized } from '../utils/http-error.ts';
import { UserService } from './user.service.ts';

const MFA_SETUP_PREFIX = 'auth:mfa:setup:';
const MFA_CHALLENGE_PREFIX = 'auth:mfa:challenge:';
const MFA_SETUP_TTL_SECONDS = 10 * 60;

interface StoredMfaSetup {
  userId: string;
  secret: string;
}

interface StoredMfaChallenge {
  userId: string;
  mode: 'login' | 'stepup';
  sessionId?: string;
  deviceId?: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
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
    const payload = await readJsonRecord<StoredMfaChallenge>(key);
    if (!payload) {
      throw unauthorized('MFA challenge expired', 'MFA_CHALLENGE_EXPIRED');
    }

    await getRedisClient().del(key);
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
      const existingHashes = user.mfa.recoveryCodeHashes ?? [];
      if (existingHashes.includes(recoveryHash)) {
        const nextHashes = existingHashes.filter((entry) => entry !== recoveryHash);
        const updatedUser = await UserService.updateMfaState({
          userId: user._id.toString(),
          totpSecretEncrypted: user.mfa.totpSecretEncrypted,
          enabledAt: user.mfa.enabledAt ?? new Date(),
          recoveryCodeHashes: nextHashes,
        });
        if (!updatedUser) {
          throw unauthorized('MFA verification failed', 'MFA_VERIFICATION_FAILED');
        }

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

  static async regenerateRecoveryCodes(user: IUser): Promise<string[]> {
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
    return recoveryCodes;
  }
}
