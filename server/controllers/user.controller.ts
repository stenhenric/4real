import { Request, Response } from 'express';

import { serializeLeaderboardUser, serializeUserProfile } from '../serializers/api.ts';
import { UserService } from '../services/user.service.ts';
import { badRequest, notFound } from '../utils/http-error.ts';

export class UserController {
  static async getProfile(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;
    if (!userId) {
      throw badRequest('User id is required', 'USER_ID_REQUIRED');
    }

    const user = await UserService.findById(userId);
    if (!user) {
      throw notFound('User not found');
    }

    res.json(serializeUserProfile(user));
  }

  static async getLeaderboard(_req: Request, res: Response): Promise<void> {
    const users = await UserService.getLeaderboard(10);
    res.json(users.map((user) => serializeLeaderboardUser(user)));
  }
}
