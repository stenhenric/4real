import mongoose from 'mongoose';

import { User } from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { UserBalanceRepository } from '../repositories/user-balance.repository.ts';

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
    return User.find().sort({ elo: -1 }).limit(limit).select('-passwordHash -__v');
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
      ? { _id: id, $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
      : { _id: id, tokenVersion: currentTokenVersion };

    const result = await User.updateOne(filter, { $inc: { tokenVersion: 1 } });
    return result.modifiedCount === 1;
  }
}
