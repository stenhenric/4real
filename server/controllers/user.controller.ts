import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserService.findById(req.params.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ id: user._id, username: user.username, elo: user.elo, balance: user.balance, stats: user.stats });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const users = await UserService.getLeaderboard(10);
      res.json(users.map(u => ({ id: u._id, username: u.username, elo: u.elo })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
}
