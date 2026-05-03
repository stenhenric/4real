import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { authenticateToken, requireMfaStepUp } from '../middleware/auth.middleware.ts';
import { createAuthRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  completeProfileRequestSchema,
  emailVerificationResendRequestSchema,
  forgotPasswordRequestSchema,
  loginPasswordRequestSchema,
  magicLinkRequestSchema,
  mfaChallengeRequestSchema,
  mfaDisableRequestSchema,
  mfaTotpVerifyRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
} from '../validation/request-schemas.ts';

const router = Router();

router.post('/register', createAuthRateLimiter(), validateBody(registerRequestSchema), asyncHandler(AuthController.register));
router.post('/login/password', createAuthRateLimiter(), validateBody(loginPasswordRequestSchema), asyncHandler(AuthController.loginPassword));
router.post('/login/magic-link/request', createAuthRateLimiter(), validateBody(magicLinkRequestSchema), asyncHandler(AuthController.requestMagicLink));
router.get('/login/magic-link/consume', asyncHandler(AuthController.consumeMagicLink));
router.get('/login/suspicious/consume', asyncHandler(AuthController.consumeSuspiciousLogin));
router.get('/oauth/google/start', asyncHandler(AuthController.startGoogleOAuth));
router.get('/oauth/google/callback', asyncHandler(AuthController.handleGoogleCallback));
router.post('/email/verify/resend', createAuthRateLimiter(), validateBody(emailVerificationResendRequestSchema), asyncHandler(AuthController.resendVerificationEmail));
router.get('/email/verify/consume', asyncHandler(AuthController.consumeVerificationEmail));
router.post('/password/forgot', createAuthRateLimiter(), validateBody(forgotPasswordRequestSchema), asyncHandler(AuthController.requestPasswordReset));
router.post('/password/reset', createAuthRateLimiter(), validateBody(passwordResetRequestSchema), asyncHandler(AuthController.resetPassword));
router.post('/mfa/challenge', createAuthRateLimiter(), validateBody(mfaChallengeRequestSchema), asyncHandler(AuthController.completeMfaChallenge));
router.post('/refresh', createAuthRateLimiter(), asyncHandler(AuthController.refreshSession));
router.get('/me', authenticateToken, asyncHandler(AuthController.me));
router.post('/logout', asyncHandler(AuthController.logout));
router.get('/sessions', authenticateToken, asyncHandler(AuthController.listSessions));
router.delete('/sessions/:sessionId', authenticateToken, requireMfaStepUp, asyncHandler(AuthController.revokeSession));
router.post('/sessions/revoke-others', authenticateToken, requireMfaStepUp, asyncHandler(AuthController.revokeOtherSessions));
router.post('/mfa/totp/setup', authenticateToken, asyncHandler(AuthController.startTotpSetup));
router.post('/mfa/totp/verify', authenticateToken, validateBody(mfaTotpVerifyRequestSchema), asyncHandler(AuthController.verifyTotpSetup));
router.post('/mfa/disable', authenticateToken, requireMfaStepUp, validateBody(mfaDisableRequestSchema), asyncHandler(AuthController.disableMfa));
router.post('/mfa/recovery-codes/regenerate', authenticateToken, requireMfaStepUp, asyncHandler(AuthController.regenerateRecoveryCodes));
router.post('/profile/complete', authenticateToken, validateBody(completeProfileRequestSchema), asyncHandler(AuthController.completeProfile));

export default router;
