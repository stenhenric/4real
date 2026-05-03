import { Router } from 'express';

import { OrderController } from '../controllers/order.controller.ts';
import { authenticateToken, requireAdmin, requireMfaStepUp, requireVerifiedAccount } from '../middleware/auth.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { updateOrderStatusRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.use(authenticateToken, requireVerifiedAccount);

router.get('/config', asyncHandler(OrderController.getMerchantConfig));
router.get('/', asyncHandler(OrderController.getOrders));
router.post('/', asyncHandler(OrderController.createOrder));
router.patch('/:id', requireAdmin, requireMfaStepUp, validateBody(updateOrderStatusRequestSchema), asyncHandler(OrderController.updateOrder));

export default router;
