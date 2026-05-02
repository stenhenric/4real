import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { createAuthRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { loginRequestSchema, registerRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.post('/register', createAuthRateLimiter(), validateBody(registerRequestSchema), asyncHandler(AuthController.register));
router.post('/login', createAuthRateLimiter(), validateBody(loginRequestSchema), asyncHandler(AuthController.login));
router.post('/refresh', createAuthRateLimiter(), asyncHandler(AuthController.refreshSession));
router.get('/me', authenticateToken, asyncHandler(AuthController.me));
router.post('/logout', asyncHandler(AuthController.logout));

export default router;
