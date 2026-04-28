import mongoose from 'mongoose';

import { User, SYSTEM_COMMISSION_ACCOUNT_ID } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';
import { TransactionService } from './transaction.service.ts';
import { trustFilter } from '../utils/trusted-filter.ts';

export class UserService {
  static async syncUserDisplayBalance(userId: string, session?: mongoose.ClientSession): Promise<number> {
    const balanceDoc = await UserBalanceRepository.findByUserId(userId, session);
    const balanceRaw = BigInt(balanceDoc?.balanceRaw ?? '0');
    const balance = Number(balanceRaw) / 1_000_000;
    await User.findByIdAndUpdate(
      userId,
      { $set: { balance } },
      session ? { session } : undefined
    );
    return balance;
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
      await this.syncUserDisplayBalance(SYSTEM_COMMISSION_ACCOUNT_ID);
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

  static async createUser(userData: Partial<IUser>): Promise<IUser> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = new User(userData);
      const saved = await user.save({ session });
      await UserBalanceRepository.ensureExists(saved._id.toString(), session);
      await this.syncUserDisplayBalance(saved._id.toString(), session);
      await session.commitTransaction();
      return saved;
    } catch (error) {
      await session.abortTransaction();
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
    const rawDelta = BigInt(Math.round(amount * 1_000_000)).toString();
    const current = await UserBalanceRepository.findByUserId(id, session);
    const currentRaw = BigInt(current?.balanceRaw ?? '0');
    await UserBalanceRepository.setBalanceRaw(id, (currentRaw + BigInt(rawDelta)).toString(), session);
    await this.syncUserDisplayBalance(id, session);
    const query = User.findById(id).select('-passwordHash -__v');
    return session ? query.session(session) : query;
  }

  static async deductBalanceSafely(id: string, amount: number, session?: mongoose.ClientSession): Promise<IUser | null> {
    if (session) {
      const amountRaw = BigInt(Math.round(amount * 1_000_000)).toString();
      const balanceDoc = await UserBalanceRepository.findByUserId(id, session);
      const currentRaw = BigInt(balanceDoc?.balanceRaw ?? '0');
      if (currentRaw < BigInt(amountRaw)) {
        return null;
      }

      await UserBalanceRepository.setBalanceRaw(id, (currentRaw - BigInt(amountRaw)).toString(), session);
      await this.syncUserDisplayBalance(id, session);
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
    return User.find({ _id: { $ne: SYSTEM_COMMISSION_ACCOUNT_ID } }).sort({ elo: -1 }).limit(limit).select('-passwordHash -__v');
  }

  static async getTokenVersion(id: string): Promise<number | null> {
    const user = await User.findById(id).select('tokenVersion').lean();
    if (!user) {
      return null;
    }

    return typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
  }

  static async bumpTokenVersionIfCurrent(id: string, currentTokenVersion: number): Promise<boolean> {
    const filter = currentTokenVersion === 0
      ? trustFilter({ _id: id, $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] })
      : { _id: id, tokenVersion: currentTokenVersion };

    const result = await User.updateOne(filter, { $inc: { tokenVersion: 1 } });
    return result.modifiedCount === 1;
  }
}
