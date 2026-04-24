import { Router } from 'express';

import { MatchController } from '../controllers/match.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createMatchRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.get('/active', asyncHandler(MatchController.getActiveMatches));
router.post('/', authenticateToken, validateBody(createMatchRequestSchema), asyncHandler(MatchController.createMatch));
router.get('/user/:userId', asyncHandler(MatchController.getUserHistory));

export default router;
