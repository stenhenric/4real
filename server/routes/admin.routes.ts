import { Router } from 'express';

import { MerchantAdminController } from '../controllers/merchant-admin.controller.ts';
import { WithdrawalRecoveryController } from '../controllers/withdrawal-recovery.controller.ts';
import { authenticateToken, requireAdmin, requireMfaStepUp, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { createAdminMutationRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import {
  merchantDepositReconcileRequestSchema,
  merchantDepositReplayWindowRequestSchema,
  updateMerchantConfigRequestSchema,
  withdrawalRecoveryRequestSchema,
} from '../validation/request-schemas.ts';

const router = Router();

router.use(authenticateToken, requireVerifiedAccount, requireAdmin, requireMfaStepUp);

router.get('/merchant/config', asyncHandler(MerchantAdminController.getConfig));
router.patch(
  '/merchant/config',
  createAdminMutationRateLimiter(),
  validateBody(updateMerchantConfigRequestSchema),
  asyncHandler(MerchantAdminController.updateConfig),
);
router.get('/merchant/dashboard', asyncHandler(MerchantAdminController.getDashboard));
router.get('/merchant/orders', asyncHandler(MerchantAdminController.getOrders));
router.get('/merchant/deposits', asyncHandler(MerchantAdminController.getDeposits));
router.post(
  '/merchant/deposits/replay-window',
  createAdminMutationRateLimiter(),
  validateBody(merchantDepositReplayWindowRequestSchema),
  asyncHandler(MerchantAdminController.replayDepositWindow),
);
router.post(
  '/merchant/deposits/:txHash/reconcile',
  createAdminMutationRateLimiter(),
  validateBody(merchantDepositReconcileRequestSchema),
  asyncHandler(MerchantAdminController.reconcileDeposit),
);
router.post(
  '/withdrawals/:withdrawalId/recover',
  createAdminMutationRateLimiter(),
  validateBody(withdrawalRecoveryRequestSchema),
  asyncHandler(WithdrawalRecoveryController.recover),
);

export default router;
