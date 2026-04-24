import { Router } from 'express';

import { UserController } from '../controllers/user.controller.ts';
import { asyncHandler } from '../utils/async-handler.ts';

const router = Router();

router.get('/leaderboard', asyncHandler(UserController.getLeaderboard));
router.get('/:userId', asyncHandler(UserController.getProfile));

export default router;
