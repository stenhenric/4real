import { Router } from 'express';
import { getUserTransactions, getAllTransactions, generateDepositMemoHandler, requestWithdrawalHandler } from '../controllers/transaction.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getUserTransactions);
router.get('/all', getAllTransactions);
router.post('/deposit/memo', generateDepositMemoHandler);
router.post('/withdraw', requestWithdrawalHandler);

export default router;
