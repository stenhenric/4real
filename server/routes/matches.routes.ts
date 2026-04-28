import { Router } from 'express';

import { MatchController } from '../controllers/match.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createMatchRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.get('/active', authenticateToken, asyncHandler(MatchController.getActiveMatches));
router.post('/', authenticateToken, validateBody(createMatchRequestSchema), asyncHandler(MatchController.createMatch));
router.post('/:roomId/join', authenticateToken, asyncHandler(MatchController.joinMatch));
router.post('/:roomId/resign', authenticateToken, asyncHandler(MatchController.resignMatch));
router.get('/user/:userId', authenticateToken, asyncHandler(MatchController.getUserHistory));
router.get('/:roomId', authenticateToken, asyncHandler(MatchController.getMatch));

export default router;
