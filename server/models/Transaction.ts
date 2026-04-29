import mongoose, { Document, Schema } from 'mongoose';

export type LedgerTransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'WITHDRAW_REFUND'
  | 'MATCH_WIN'
  | 'MATCH_LOSS'
  | 'MATCH_DRAW'
  | 'MATCH_REFUND'
  | 'MATCH_WAGER'
  | 'BUY_P2P'
  | 'SELL_P2P'
  | 'SELL_P2P_REFUND';

export type LedgerTransactionStatus = 'PENDING' | 'COMPLETED' | 'REJECTED' | 'DONE';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: LedgerTransactionType;
  amount: number;
  status: LedgerTransactionStatus;
  referenceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'DEPOSIT',
      'WITHDRAW',
      'WITHDRAW_REFUND',
      'MATCH_WIN',
      'MATCH_LOSS',
      'MATCH_DRAW',
      'MATCH_REFUND',
      'MATCH_WAGER',
      'BUY_P2P',
      'SELL_P2P',
      'SELL_P2P_REFUND',
    ],
    required: true
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'REJECTED', 'DONE'], default: 'COMPLETED', index: true },
  referenceId: { type: String }
}, {
  timestamps: true
});

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ referenceId: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
