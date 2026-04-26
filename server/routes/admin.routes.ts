import { Router } from 'express';

import { MerchantAdminController } from '../controllers/merchant-admin.controller.ts';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { updateMerchantConfigRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/merchant/config', asyncHandler(MerchantAdminController.getConfig));
router.patch('/merchant/config', validateBody(updateMerchantConfigRequestSchema), asyncHandler(MerchantAdminController.updateConfig));
router.get('/merchant/dashboard', asyncHandler(MerchantAdminController.getDashboard));
router.get('/merchant/orders', asyncHandler(MerchantAdminController.getOrders));

export default router;
