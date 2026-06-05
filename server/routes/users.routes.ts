import { Router } from 'express';

import { UserController } from '../controllers/user.controller.ts';
import { authenticateToken, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { avatarSettingsRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.get('/leaderboard', asyncHandler(UserController.getLeaderboard));
router.patch(
  '/me/avatar',
  authenticateToken,
  requireVerifiedAccount,
  validateBody(avatarSettingsRequestSchema),
  asyncHandler(UserController.updateAvatar),
);
router.get('/:userId', asyncHandler(UserController.getProfile));

export default router;
