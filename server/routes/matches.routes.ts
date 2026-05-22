import { Router } from 'express';

import { MatchController } from '../controllers/match.controller.ts';
import { authenticateToken, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { createMatchMutationRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createMatchRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.get('/active', asyncHandler(MatchController.getActiveMatches));
router.use(authenticateToken, requireVerifiedAccount);
router.post('/', createMatchMutationRateLimiter(), validateBody(createMatchRequestSchema), asyncHandler(MatchController.createMatch));
router.post('/:roomId/join', createMatchMutationRateLimiter(), asyncHandler(MatchController.joinMatch));
router.post('/:roomId/resign', createMatchMutationRateLimiter(), asyncHandler(MatchController.resignMatch));
router.get('/user/:userId', asyncHandler(MatchController.getUserHistory));
router.get('/:roomId', asyncHandler(MatchController.getMatch));

export default router;
