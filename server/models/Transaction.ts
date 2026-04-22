import mongoose, { Document, Schema } from 'mongoose';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'DEPOSIT' | 'WITHDRAW' | 'MATCH_WIN' | 'MATCH_LOSS' | 'MATCH_DRAW' | 'MATCH_WAGER' | 'BUY_P2P' | 'SELL_P2P';
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'DONE';
  referenceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['DEPOSIT', 'WITHDRAW', 'MATCH_WIN', 'MATCH_LOSS', 'MATCH_DRAW', 'MATCH_WAGER', 'BUY_P2P', 'SELL_P2P'],
    required: true
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'REJECTED', 'DONE'], default: 'COMPLETED', index: true },
  referenceId: { type: String, index: true }
}, {
  timestamps: true
});

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
