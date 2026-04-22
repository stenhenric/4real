import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TransactionService } from '../services/transaction.service';

export const getUserTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const transactions = await TransactionService.getTransactionsByUser(userId);
    res.json(transactions);
  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const getAllTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user!.isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const transactions = await TransactionService.getAllTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};
