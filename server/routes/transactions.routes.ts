import { Router } from 'express';
import { getUserTransactions, getAllTransactions, generateDepositMemoHandler, requestWithdrawalHandler } from '../controllers/transaction.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getUserTransactions);
router.get('/all', requireAdmin, getAllTransactions);
router.post('/deposit/memo', generateDepositMemoHandler);
router.post('/withdraw', requestWithdrawalHandler);

export default router;
