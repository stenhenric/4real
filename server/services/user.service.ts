import { User, IUser } from '../models/User';

export class UserService {
  static async createUser(userData: Partial<IUser>): Promise<IUser> {
    const user = new User(userData);
    return user.save();
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
    return User.findByIdAndUpdate(id, { $inc: { balance: amount } }, { returnDocument: 'after' });
  }

  static async deductBalanceSafely(id: string, amount: number): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { _id: id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { returnDocument: 'after' }
    );
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
