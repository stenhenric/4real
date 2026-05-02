import mongoose from 'mongoose';

import { User, SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { TransactionService } from './transaction.service.ts';
import { trustFilter } from '../utils/trusted-filter.ts';
import { rawAmountToUsdtNumber, usdtNumberToRawAmount } from '../utils/money.ts';
import { conflict } from '../utils/http-error.ts';

export interface CreateUserInput {
  username: string;
  email: string;
  passwordHash: string;
  elo?: number;
  isAdmin?: boolean;
  tokenVersion?: number;
}

export class UserService {
  static async getDisplayBalance(userId: string, session?: mongoose.ClientSession): Promise<number> {
    const balanceDoc = await UserBalanceRepository.findByUserId(userId, session);
    return rawAmountToUsdtNumber(UserBalanceRepository.getBalanceRaw(balanceDoc));
  }

  static async ensureSystemCommissionAccountExists(): Promise<void> {
    const existing = await User.findById(SYSTEM_COMMISSION_ACCOUNT_ID);
    if (!existing) {
      const user = new User({
        _id: new mongoose.Types.ObjectId(SYSTEM_COMMISSION_ACCOUNT_ID),
        username: 'system_commission',
        email: 'commission@system.local',
        passwordHash: 'none',
        balance: 0,
        elo: 1000,
        isAdmin: true,
      });
      await user.save();
      await UserBalanceRepository.ensureExists(SYSTEM_COMMISSION_ACCOUNT_ID);
    }
  }

  static async routeCommissionToAdmin(amount: number, referenceId: string, session: mongoose.ClientSession): Promise<void> {
    if (amount <= 0) return;
    
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
      const user = new User({
        username: userData.username,
        email: userData.email,
        passwordHash: userData.passwordHash,
        balance: 0,
        elo: userData.elo ?? 1000,
        isAdmin: userData.isAdmin ?? false,
        tokenVersion: userData.tokenVersion ?? 0,
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

        throw conflict('User already exists', 'USER_ALREADY_EXISTS');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  static async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  static async findByUsername(username: string): Promise<IUser | null> {
    return User.findOne({ username });
  }

  static async findById(id: string, session?: mongoose.ClientSession): Promise<IUser | null> {
    const query = User.findById(id).select('-passwordHash -__v');
    return session ? query.session(session) : query;
  }

  static async updateBalance(id: string, amount: number, session?: mongoose.ClientSession): Promise<IUser | null> {
    const rawDelta = usdtNumberToRawAmount(amount);
    if (rawDelta === 0n) {
      return this.findById(id, session);
    }

    if (rawDelta < 0n) {
      return this.deductBalanceSafely(id, Math.abs(amount), session);
    }

    await UserBalanceRepository.adjustBalanceRaw(id, rawDelta.toString(), session);
    return this.findById(id, session);
  }

  static async deductBalanceSafely(id: string, amount: number, session?: mongoose.ClientSession): Promise<IUser | null> {
    if (amount <= 0) {
      return this.findById(id, session);
    }

    if (session) {
      const updatedBalance = await UserBalanceRepository.deductBalanceRawIfSufficient(
        id,
        usdtNumberToRawAmount(amount).toString(),
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
        updatedUser = await this.deductBalanceSafely(id, amount, ownSession);
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
    const incQuery: Record<string, number> = { elo: eloChange };
    if (result === 'win') incQuery['stats.wins'] = 1;
    else if (result === 'loss') incQuery['stats.losses'] = 1;
    else if (result === 'draw') incQuery['stats.draws'] = 1;

    return User.findByIdAndUpdate(
      id,
      { $inc: incQuery },
      { returnDocument: 'after', ...(session ? { session } : {}) },
    );
  }

  static async getLeaderboard(limit: number = 10): Promise<IUser[]> {
    return User.find(trustFilter({ _id: { $ne: SYSTEM_COMMISSION_ACCOUNT_ID } }))
      .sort({ elo: -1 })
      .limit(limit)
      .select('-passwordHash -__v');
  }

  static async getTokenVersion(id: string): Promise<number | null> {
    const authState = await this.getAuthState(id);
    if (!authState) {
      return null;
    }

    return authState.tokenVersion;
  }

  static async getAuthState(id: string): Promise<{ tokenVersion: number; isAdmin: boolean } | null> {
    const user = await User.findById(id).select('tokenVersion isAdmin').lean();
    if (!user) {
      return null;
    }

    return {
      tokenVersion: typeof user.tokenVersion === 'number' ? user.tokenVersion : 0,
      isAdmin: user.isAdmin === true,
    };
  }

  static async bumpTokenVersionIfCurrent(id: string, currentTokenVersion: number): Promise<boolean> {
    const filter = currentTokenVersion === 0
      ? trustFilter({ _id: id, $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] })
      : { _id: id, tokenVersion: currentTokenVersion };

    const result = await User.updateOne(filter, { $inc: { tokenVersion: 1 } });
    return result.modifiedCount === 1;
  }
}
