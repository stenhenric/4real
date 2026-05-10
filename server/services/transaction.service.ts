import mongoose from 'mongoose';

import { serializeDepositTransaction, serializeLedgerTransaction, serializeWithdrawalTransaction } from '../serializers/api.ts';
import { Transaction } from '../models/Transaction.ts';
import type { ITransaction, LedgerTransactionStatus, LedgerTransactionType } from '../models/Transaction.ts';
import { DepositRepository } from '../repositories/deposit.repository.ts';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.ts';
import type { TransactionDTO, TransactionFeedDTO } from '../types/api.ts';

const MAX_UNIFIED_TRANSACTION_FETCH_LIMIT = 10_000;
const MAX_TRANSACTION_OFFSET = 10_000;

interface CreateTransactionInput {
  userId: string | mongoose.Types.ObjectId;
  type: LedgerTransactionType;
  amount: string;
  status?: LedgerTransactionStatus;
  referenceId?: string;
  session?: mongoose.ClientSession;
}

export class TransactionService {
  static async createTransaction(data: CreateTransactionInput): Promise<ITransaction> {
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

  static async getTransactionsByUser(userId: string | mongoose.Types.ObjectId, limit?: number): Promise<ITransaction[]> {
    const normalizedUserId = typeof userId === 'string'
      ? new mongoose.Types.ObjectId(userId)
      : userId;
    const query = Transaction.find({ userId: normalizedUserId }).sort({ createdAt: -1 });
    return limit ? query.limit(limit) : query;
  }

  static async getAllTransactions(limit: number = 100, offset: number = 0): Promise<ITransaction[]> {
    const requestedLimit = Math.floor(limit);
    const requestedOffset = Math.floor(offset);
    const normalizedLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, requestedLimit), 500)
      : 100;
    const normalizedOffset = Number.isFinite(requestedOffset)
      ? Math.min(Math.max(0, requestedOffset), MAX_TRANSACTION_OFFSET)
      : 0;
    return Transaction.find().sort({ createdAt: -1 }).skip(normalizedOffset).limit(normalizedLimit);
  }

  static async getUnifiedTransactionsByUser(userId: string, page = 1, pageSize = 25): Promise<TransactionFeedDTO> {
    const requestedPage = Math.floor(page);
    const requestedPageSize = Math.floor(pageSize);
    const normalizedPageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(1, requestedPageSize), 100)
      : 25;
    const maxPage = Math.max(1, Math.floor(MAX_UNIFIED_TRANSACTION_FETCH_LIMIT / normalizedPageSize));
    const normalizedPage = Number.isFinite(requestedPage)
      ? Math.min(Math.max(1, requestedPage), maxPage)
      : 1;
    const fetchLimit = normalizedPage * normalizedPageSize;
    const [transactions, deposits, withdrawals] = await Promise.all([
      this.getTransactionsByUser(userId, fetchLimit),
      DepositRepository.findByUserId(userId, fetchLimit),
      WithdrawalRepository.findByUserId(userId, fetchLimit),
    ]);

    const items = [
      ...transactions.map((transaction) => serializeLedgerTransaction(transaction)),
      ...deposits.map((deposit) => serializeDepositTransaction(deposit)),
      ...withdrawals.map((withdrawal) => serializeWithdrawalTransaction(withdrawal)),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const startIndex = (normalizedPage - 1) * normalizedPageSize;
    return {
      items: items.slice(startIndex, startIndex + normalizedPageSize),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: items.length,
    };
  }

  static async updateTransactionStatusByReference(
    referenceId: string,
    status: LedgerTransactionStatus,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    await Transaction.updateMany(
      { referenceId },
      { $set: { status } },
      session ? { session } : undefined,
    );
  }
}
