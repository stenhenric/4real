import mongoose from 'mongoose';

import { serializeDepositTransaction, serializeLedgerTransaction, serializeWithdrawalTransaction } from '../serializers/api.ts';
import { Transaction } from '../models/Transaction.ts';
import type { ITransaction } from '../models/Transaction.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import type { TransactionDTO } from '../types/api.ts';

export class TransactionService {
  static async createTransaction(data: {
    userId: string | mongoose.Types.ObjectId;
    type: string;
    amount: number;
    status?: string;
    referenceId?: string;
    session?: mongoose.ClientSession;
  }): Promise<ITransaction> {
    const userId = typeof data.userId === 'string'
      ? new mongoose.Types.ObjectId(data.userId)
      : data.userId;
    const transaction = new Transaction({
      userId,
      type: data.type,
      amount: data.amount,
      status: data.status ?? 'COMPLETED',
      referenceId: data.referenceId,
    });
    return transaction.save(data.session ? { session: data.session } : undefined);
  }

  static async getTransactionsByUser(userId: string | mongoose.Types.ObjectId): Promise<ITransaction[]> {
    const normalizedUserId = typeof userId === 'string'
      ? new mongoose.Types.ObjectId(userId)
      : userId;
    return Transaction.find({ userId: normalizedUserId }).sort({ createdAt: -1 });
  }

  static async getAllTransactions(): Promise<ITransaction[]> {
    return Transaction.find().sort({ createdAt: -1 });
  }

  static async getUnifiedTransactionsByUser(userId: string): Promise<TransactionDTO[]> {
    const [transactions, deposits, withdrawals] = await Promise.all([
      this.getTransactionsByUser(userId),
      DepositRepository.findByUserId(userId),
      WithdrawalRepository.findByUserId(userId),
    ]);

    return [
      ...transactions.map((transaction) => serializeLedgerTransaction(transaction)),
      ...deposits.map((deposit) => serializeDepositTransaction(deposit)),
      ...withdrawals.map((withdrawal) => serializeWithdrawalTransaction(withdrawal)),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  static async updateTransactionStatusByReference(
    referenceId: string,
    status: string,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await Transaction.updateMany(
      { referenceId },
      { $set: { status } },
      session ? { session } : undefined,
    );
  }
}
