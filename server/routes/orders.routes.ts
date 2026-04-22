import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, OrderController.getOrders);
router.post('/', authenticateToken, OrderController.createOrder);
router.patch('/:id', authenticateToken, requireAdmin, OrderController.updateOrder);

export default router;
