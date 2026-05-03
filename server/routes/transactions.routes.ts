import { Router } from 'express';
import {
  getUserTransactions,
  getAllTransactions,
  generateDepositMemoHandler,
  getWithdrawalStatusHandler,
  prepareTonConnectDepositHandler,
  requestWithdrawalHandler,
} from '../controllers/transaction.controller.ts';
import { authenticateToken, requireAdmin, requireMfaStepUp, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { createWithdrawalRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  prepareTonConnectDepositRequestSchema,
  withdrawRequestSchema,
} from '../validation/request-schemas.ts';

const router = Router();

router.use(authenticateToken, requireVerifiedAccount);

router.get('/', asyncHandler(getUserTransactions));
router.get('/all', requireAdmin, requireMfaStepUp, asyncHandler(getAllTransactions));
router.get('/withdrawals/:withdrawalId', asyncHandler(getWithdrawalStatusHandler));
router.post('/deposit/memo', asyncHandler(generateDepositMemoHandler));
router.post('/deposit/prepare', validateBody(prepareTonConnectDepositRequestSchema), asyncHandler(prepareTonConnectDepositHandler));
router.post('/withdraw', requireMfaStepUp, createWithdrawalRateLimiter(), validateBody(withdrawRequestSchema), asyncHandler(requestWithdrawalHandler));

export default router;
