import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();

router.get('/leaderboard', UserController.getLeaderboard);
router.get('/:userId', UserController.getProfile);

export default router;
