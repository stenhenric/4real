import { Router } from 'express';
import { getUserTransactions, getAllTransactions } from '../controllers/transaction.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getUserTransactions);
router.get('/all', getAllTransactions);

export default router;
