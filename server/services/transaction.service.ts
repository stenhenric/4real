import { Transaction, ITransaction } from '../models/Transaction';
import mongoose from 'mongoose';

export class TransactionService {
  static async createTransaction(data: {
    userId: string | mongoose.Types.ObjectId;
    type: string;
    amount: number;
    status?: string;
    referenceId?: string;
  }): Promise<ITransaction> {
    const transaction = new Transaction({
      userId: new mongoose.Types.ObjectId(data.userId as string),
      type: data.type,
      amount: data.amount,
      status: data.status || 'COMPLETED',
      referenceId: data.referenceId
    });
    return transaction.save();
  }

  static async getTransactionsByUser(userId: string | mongoose.Types.ObjectId): Promise<ITransaction[]> {
    return Transaction.find({ userId: new mongoose.Types.ObjectId(userId as string) }).sort({ createdAt: -1 });
  }

  static async getAllTransactions(): Promise<ITransaction[]> {
    return Transaction.find().sort({ createdAt: -1 });
  }

  static async updateTransactionStatusByReference(referenceId: string, status: string): Promise<void> {
    await Transaction.updateMany({ referenceId }, { $set: { status } });
  }
}
