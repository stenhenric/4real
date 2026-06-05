import mongoose from 'mongoose';

import { User, SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import type { AvatarSettingsDTO } from '../types/api.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { TransactionService } from './transaction.service.ts';
import { trustFilter } from '../utils/trusted-filter.ts';
import { formatUsdtAmount, parseUsdtAmount } from '../utils/money.ts';
import { conflict } from '../utils/http-error.ts';
import { cleanUsername, normalizeEmail, normalizeUsername } from './auth-identity.service.ts';
import { RATING_SYSTEM } from '../../shared/rating.ts';

export interface CreateUserInput {
  username?: string | null;
  email: string;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
  googleSubject?: string | null;
  elo?: number;
  isAdmin?: boolean;
}

export interface VerifiedMerchantEmailRecipient {
  id: string;
  email: string;
  username?: string | null;
}

export interface LeaderboardUserRecord {
  _id: { toString(): string };
  username?: string | null;
  elo: number;
}

export class UserService {
  static async getDisplayBalance(userId: string, session?: mongoose.ClientSession): Promise<string> {
    const balanceDoc = await UserBalanceRepository.findByUserId(userId, session);
    return formatUsdtAmount(UserBalanceRepository.getBalanceRaw(balanceDoc));
  }

  static async ensureSystemCommissionAccountExists(): Promise<void> {
    const existing = await User.findById(SYSTEM_COMMISSION_ACCOUNT_ID);
    if (!existing) {
      const user = new User({
        _id: new mongoose.Types.ObjectId(SYSTEM_COMMISSION_ACCOUNT_ID),
        username: 'system_commission',
        usernameNormalized: 'system_commission',
        email: 'commission@system.local',
        passwordHash: 'none',
        emailVerifiedAt: new Date(),
        balance: '0.000000',
        elo: RATING_SYSTEM.startingRating,
        isAdmin: true,
      });
      await user.save();
      await UserBalanceRepository.ensureExists(SYSTEM_COMMISSION_ACCOUNT_ID);
    }
  }

  static async routeCommissionToAdmin(amount: string, referenceId: string, session: mongoose.ClientSession): Promise<void> {
    if (parseUsdtAmount(amount) <= 0n) return;
    
    await this.updateBalance(SYSTEM_COMMISSION_ACCOUNT_ID, amount, session);
    await TransactionService.createTransaction({
      userId: SYSTEM_COMMISSION_ACCOUNT_ID,
      type: 'MATCH_WIN',
      amount,
      referenceId,
      session,
    });
  }

  static async createUser(userData: CreateUserInput): Promise<IUser> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const username = userData.username ? cleanUsername(userData.username) : undefined;
      const user = new User({
        username,
        usernameNormalized: username ? normalizeUsername(username) : undefined,
        email: normalizeEmail(userData.email),
        passwordHash: userData.passwordHash ?? undefined,
        emailVerifiedAt: userData.emailVerifiedAt ?? undefined,
        googleSubject: userData.googleSubject ?? undefined,
        balance: '0.000000',
        elo: userData.elo ?? RATING_SYSTEM.startingRating,
        isAdmin: userData.isAdmin ?? false,
      });
      const saved = await user.save({ session });
      await UserBalanceRepository.ensureExists(saved._id.toString(), session, '0');
      await session.commitTransaction();
      return saved;
    } catch (error) {
      await session.abortTransaction();
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const duplicateKeyError = error as { keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> };
        const duplicateField = Object.keys(duplicateKeyError.keyPattern ?? duplicateKeyError.keyValue ?? {})[0];

        if (duplicateField === 'email') {
          throw conflict('Email already exists', 'EMAIL_ALREADY_EXISTS', { field: duplicateField });
        }

        if (duplicateField === 'username') {
          throw conflict('Username already exists', 'USERNAME_ALREADY_EXISTS', { field: duplicateField });
        }

        if (duplicateField === 'usernameNormalized') {
          throw conflict('Username already exists', 'USERNAME_ALREADY_EXISTS', { field: 'username' });
        }

        if (duplicateField === 'googleSubject') {
          throw conflict('Google account already linked', 'GOOGLE_ACCOUNT_ALREADY_LINKED', { field: 'googleSubject' });
        }

        throw conflict('User already exists', 'USER_ALREADY_EXISTS');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  static async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  }

  static async findByUsername(username: string): Promise<IUser | null> {
    return User.findOne({ usernameNormalized: normalizeUsername(username) }).select('+passwordHash');
  }

  static async findByGoogleSubject(googleSubject: string): Promise<IUser | null> {
    return User.findOne({ googleSubject });
  }

  static async findById(id: string, session?: mongoose.ClientSession): Promise<IUser | null> {
    const query = User.findById(id).select('-passwordHash -__v');
    return session ? query.session(session) : query;
  }

  static async findVerifiedMerchantEmailRecipients(): Promise<VerifiedMerchantEmailRecipient[]> {
    const users = await User.find({
      _id: { $ne: new mongoose.Types.ObjectId(SYSTEM_COMMISSION_ACCOUNT_ID) },
      isAdmin: true,
      emailVerifiedAt: { $exists: true, $ne: null },
    })
      .select('_id email username')
      .lean();

    return users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      username: user.username ?? null,
    }));
  }

  static async findAuthUserById(id: string): Promise<IUser | null> {
    return User.findById(id).select('+passwordHash');
  }

  static async markEmailVerified(id: string): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: { emailVerifiedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }

  static async setPasswordHash(id: string, passwordHash: string): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: { passwordHash } },
      { returnDocument: 'after' },
    );
  }

  static async setUsername(id: string, username: string): Promise<IUser | null> {
    const cleaned = cleanUsername(username);
    return User.findByIdAndUpdate(
      id,
      {
        $set: {
          username: cleaned,
          usernameNormalized: normalizeUsername(cleaned),
        },
      },
      { returnDocument: 'after' },
    );
  }

  static async updateAvatarSettings(id: string, avatar: AvatarSettingsDTO): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      {
        $set: {
          'avatar.preset': avatar.preset,
          'avatar.color': avatar.color,
        },
      },
      { returnDocument: 'after' },
    );
  }

  static async linkGoogleAccount(id: string, googleSubject: string): Promise<IUser | null> {
    return User.findOneAndUpdate(
      trustFilter({
        _id: id,
        emailVerifiedAt: { $exists: true, $ne: null },
      }),
      {
        $set: {
          googleSubject,
        },
      },
      { returnDocument: 'after' },
    );
  }

  static async updateMfaState(params: {
    userId: string;
    totpSecretEncrypted: string | null;
    enabledAt: Date | null;
    recoveryCodeHashes: string[];
  }): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      params.userId,
      {
        $set: {
          'mfa.totpSecretEncrypted': params.totpSecretEncrypted,
          'mfa.enabledAt': params.enabledAt,
          'mfa.recoveryCodeHashes': params.recoveryCodeHashes,
        },
      },
      { returnDocument: 'after' },
    );
  }

  static async consumeMfaRecoveryCode(params: {
    userId: string;
    recoveryCodeHash: string;
  }): Promise<IUser | null> {
    const result = await User.updateOne(
      {
        _id: params.userId,
        'mfa.recoveryCodeHashes': params.recoveryCodeHash,
      },
      {
        $pull: {
          'mfa.recoveryCodeHashes': params.recoveryCodeHash,
        },
      },
    );

    if (result.modifiedCount !== 1) {
      return null;
    }

    return this.findAuthUserById(params.userId);
  }

  static async updateSecurityLogin(params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    suspicious?: boolean;
  }): Promise<void> {
    await User.updateOne(
      { _id: params.userId },
      {
        $set: {
          'security.lastLoginAt': new Date(),
          'security.lastLoginIp': params.ipAddress ?? null,
          'security.lastLoginUserAgent': params.userAgent ?? null,
          ...(params.suspicious ? { 'security.lastSuspiciousLoginAt': new Date() } : {}),
        },
      },
    );
  }

  static async updateBalance(id: string, amount: string, session?: mongoose.ClientSession): Promise<IUser | null> {
    const rawDelta = parseUsdtAmount(amount);
    if (rawDelta === 0n) {
      return this.findById(id, session);
    }

    if (rawDelta < 0n) {
      return this.deductBalanceSafely(id, formatUsdtAmount(-rawDelta), session);
    }

    await UserBalanceRepository.adjustBalanceRaw(id, rawDelta.toString(), session);
    return this.findById(id, session);
  }

  static async deductBalanceSafely(id: string, amount: string, session?: mongoose.ClientSession): Promise<IUser | null> {
    const amountRaw = parseUsdtAmount(amount);
    if (amountRaw <= 0n) {
      return this.findById(id, session);
    }

    if (session) {
      const updatedBalance = await UserBalanceRepository.deductBalanceRawIfSufficient(
        id,
        amountRaw.toString(),
        session,
      );
      if (!updatedBalance) {
        return null;
      }

      return this.findById(id, session);
    }

    const ownSession = await mongoose.startSession();
    try {
      let updatedUser: IUser | null = null;
      await ownSession.withTransaction(async () => {
        updatedUser = await this.deductBalanceSafely(id, formatUsdtAmount(amountRaw), ownSession);
      });
      return updatedUser;
    } catch (error) {
      throw error;
    } finally {
      await ownSession.endSession();
    }
  }

  static async updateStatsAndElo(
    id: string,
    eloChange: number,
    result: 'win' | 'loss' | 'draw',
    session?: mongoose.ClientSession,
  ): Promise<IUser | null> {
    const existingUser = await this.findById(id, session);
    if (!existingUser) {
      return null;
    }

    const incQuery: Record<string, number> = {};
    if (result === 'win') incQuery['stats.wins'] = 1;
    else if (result === 'loss') incQuery['stats.losses'] = 1;
    else if (result === 'draw') incQuery['stats.draws'] = 1;

    return User.findByIdAndUpdate(
      id,
      {
        $set: {
          elo: Math.max(RATING_SYSTEM.minimumRating, existingUser.elo + eloChange),
        },
        ...(Object.keys(incQuery).length > 0 ? { $inc: incQuery } : {}),
      },
      { returnDocument: 'after', ...(session ? { session } : {}) },
    );
  }

  static async getLeaderboard(limit: number = 10): Promise<LeaderboardUserRecord[]> {
    return User.find(trustFilter({
      _id: { $ne: SYSTEM_COMMISSION_ACCOUNT_ID },
      usernameNormalized: { $type: 'string' as const },
    }))
      .sort({ elo: -1 })
      .limit(limit)
      .select('_id username elo')
      .lean<LeaderboardUserRecord[]>();
  }
}
