import { Request, Response } from 'express';
import { MatchService } from '../services/match.service';
import { UserService } from '../services/user.service';

export class MatchController {
  static async getActiveMatches(req: Request, res: Response): Promise<void> {
    try {
      const matches = await MatchService.getActiveMatches();
      res.json(matches);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async createMatch(req: any, res: Response): Promise<void> {
    try {
      const { wager, isPrivate } = req.body;
      const user = await UserService.findById(req.user.id);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (wager > user.balance) {
        res.status(400).json({ error: 'INSUFFICIENT_BALANCE' });
        return;
      }

      // We just create a roomId, and let socket handle the rest for now, or insert properly
      const roomId = Math.random().toString(36).substring(2, 8);

      const match = await MatchService.createMatch({
        roomId,
        player1Id: user._id,
        p1Username: user.username,
        wager: wager || 0,
        isPrivate: isPrivate || false,
        status: 'waiting',
        moveHistory: []
      });

      // Deduct wager initially from creator
      if (wager > 0) {
        await UserService.updateBalance(user._id.toString(), -wager);
      }

      res.status(201).json(match);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async getUserHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const matches = await MatchService.getUserHistory(userId);
      res.json(matches);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  }
}
