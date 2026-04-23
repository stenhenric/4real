import { User, IUser } from '../models/User';
import mongoose from 'mongoose';

export class UserService {
  static async syncUserDisplayBalance(userId: string, session?: mongoose.ClientSession): Promise<number> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    const balanceDoc = await db.collection('user_balances').findOne(
      { userId },
      { session }
    );
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
      const db = mongoose.connection.db;
      if (!db) throw new Error('Database not connected');
      await db.collection('user_balances').updateOne(
        { userId: saved._id.toString() },
        { $setOnInsert: { balanceRaw: '0', createdAt: new Date() }, $set: { updatedAt: new Date() } },
        { upsert: true, session }
      );
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

  static async findById(id: string): Promise<IUser | null> {
    return User.findById(id).select('-passwordHash -__v');
  }

  static async updateBalance(id: string, amount: number): Promise<IUser | null> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    const rawDelta = BigInt(Math.round(amount * 1_000_000)).toString();
    const current = await db.collection('user_balances').findOne({ userId: id });
    const currentRaw = BigInt(current?.balanceRaw ?? '0');
    await db.collection('user_balances').updateOne(
      { userId: id },
      {
        $set: { balanceRaw: (currentRaw + BigInt(rawDelta)).toString(), updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    await this.syncUserDisplayBalance(id);
    return User.findById(id).select('-passwordHash -__v');
  }

  static async deductBalanceSafely(id: string, amount: number): Promise<IUser | null> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const amountRaw = BigInt(Math.round(amount * 1_000_000)).toString();
      const balanceDoc = await db.collection('user_balances').findOne({ userId: id }, { session });
      const currentRaw = BigInt(balanceDoc?.balanceRaw ?? '0');
      if (currentRaw < BigInt(amountRaw)) {
        await session.abortTransaction();
        return null;
      }
      await db.collection('user_balances').updateOne(
        { userId: id },
        { $set: { balanceRaw: (currentRaw - BigInt(amountRaw)).toString(), updatedAt: new Date() } },
        { upsert: true, session }
      );
      await this.syncUserDisplayBalance(id, session);
      await session.commitTransaction();
      return User.findById(id).select('-passwordHash -__v');
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  static async updateStatsAndElo(
    id: string,
    eloChange: number,
    result: 'win' | 'loss' | 'draw'
  ): Promise<IUser | null> {
    const incQuery: Record<string, number> = { elo: eloChange };
    if (result === 'win') incQuery['stats.wins'] = 1;
    else if (result === 'loss') incQuery['stats.losses'] = 1;
    else if (result === 'draw') incQuery['stats.draws'] = 1;

    return User.findByIdAndUpdate(id, { $inc: incQuery }, { returnDocument: 'after' });
  }

  static async getLeaderboard(limit: number = 10): Promise<IUser[]> {
    return User.find().sort({ elo: -1 }).limit(limit).select('-passwordHash -__v');
  }
}
