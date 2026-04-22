import { Router } from 'express';
import { MatchController } from '../controllers/match.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/active', MatchController.getActiveMatches);
router.post('/', authenticateToken, MatchController.createMatch);
router.get('/user/:userId', MatchController.getUserHistory);

export default router;
