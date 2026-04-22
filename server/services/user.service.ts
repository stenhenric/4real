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
    return User.findByIdAndUpdate(id, { $inc: { balance: amount } }, { new: true });
  }

  static async deductBalanceSafely(id: string, amount: number): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { _id: id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
  }

  static async updateElo(id: string, eloChange: number): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $inc: { elo: eloChange } }, { new: true });
  }

  static async getLeaderboard(limit: number = 10): Promise<IUser[]> {
    return User.find().sort({ elo: -1 }).limit(limit).select('-passwordHash -__v');
  }
}
