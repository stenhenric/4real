import { Router } from 'express';

import { MerchantAdminController } from '../controllers/merchant-admin.controller.ts';
import { authenticateToken, requireAdmin, requireMfaStepUp, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import {
  merchantDepositReconcileRequestSchema,
  merchantDepositReplayWindowRequestSchema,
  updateMerchantConfigRequestSchema,
} from '../validation/request-schemas.ts';

const router = Router();

router.use(authenticateToken, requireVerifiedAccount, requireAdmin, requireMfaStepUp);

router.get('/merchant/config', asyncHandler(MerchantAdminController.getConfig));
router.patch('/merchant/config', validateBody(updateMerchantConfigRequestSchema), asyncHandler(MerchantAdminController.updateConfig));
router.get('/merchant/dashboard', asyncHandler(MerchantAdminController.getDashboard));
router.get('/merchant/orders', asyncHandler(MerchantAdminController.getOrders));
router.get('/merchant/deposits', asyncHandler(MerchantAdminController.getDeposits));
router.post(
  '/merchant/deposits/replay-window',
  validateBody(merchantDepositReplayWindowRequestSchema),
  asyncHandler(MerchantAdminController.replayDepositWindow),
);
router.post(
  '/merchant/deposits/:txHash/reconcile',
  validateBody(merchantDepositReconcileRequestSchema),
  asyncHandler(MerchantAdminController.reconcileDeposit),
);

export default router;
