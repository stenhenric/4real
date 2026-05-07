import type { Request, Response } from 'express';

import { applyPublicCacheHeaders } from '../http/cache-policy.ts';
import { serializeLeaderboardUser, serializeUserProfile } from '../serializers/api.ts';
import { CacheKeys, CACHE_TTLS, getOrPopulateJson } from '../services/cache.service.ts';
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

    applyPublicCacheHeaders(res, 30);
    res.json(serializeUserProfile(user));
  }

  static async getLeaderboard(_req: Request, res: Response): Promise<void> {
    const { value: users } = await getOrPopulateJson({
      key: CacheKeys.leaderboard(10),
      ttlSeconds: CACHE_TTLS.leaderboard,
      loader: async () => {
        const leaderboardUsers = await UserService.getLeaderboard(10);
        return leaderboardUsers.map((user) => serializeLeaderboardUser(user));
      },
    });
    applyPublicCacheHeaders(res, 30);
    res.json(users);
  }
}
