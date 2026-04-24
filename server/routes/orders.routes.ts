import { Router } from 'express';

import { OrderController } from '../controllers/order.controller.ts';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.ts';
import { asyncHandler } from '../utils/async-handler.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createOrderRequestSchema, updateOrderStatusRequestSchema } from '../validation/request-schemas.ts';

const router = Router();

router.get('/config', authenticateToken, asyncHandler(OrderController.getMerchantConfig));
router.get('/', authenticateToken, asyncHandler(OrderController.getOrders));
router.post('/', authenticateToken, validateBody(createOrderRequestSchema), asyncHandler(OrderController.createOrder));
router.patch('/:id', authenticateToken, requireAdmin, validateBody(updateOrderStatusRequestSchema), asyncHandler(OrderController.updateOrder));

export default router;
