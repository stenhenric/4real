import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TransactionService } from '../services/transaction.service';
import { generateDepositMemo } from '../services/deposit-service';
import { requestWithdrawal } from '../services/withdrawal-service';
import { v4 as uuidv4 } from 'uuid';

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


export const generateDepositMemoHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await generateDepositMemo(userId);
    res.json(result);
  } catch (error: any) {
    console.error('Generate deposit memo error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate deposit memo' });
  }
};

export const requestWithdrawalHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { toAddress, amountUsdt } = req.body;

    if (!toAddress || !amountUsdt || !Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      res.status(400).json({ error: 'Invalid toAddress or amountUsdt' });
      return;
    }

    const withdrawalId = uuidv4();
    await requestWithdrawal({ userId, toAddress, amountUsdt, withdrawalId });

    res.json({ success: true, message: 'Withdrawal requested successfully', withdrawalId });
  } catch (error: any) {
    console.error('Request withdrawal error:', error);
    res.status(400).json({ error: error.message || 'Failed to request withdrawal' });
  }
};
