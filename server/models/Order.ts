import mongoose, { Document, Schema } from 'mongoose';

export interface TelegramOrderProof {
  provider: 'telegram';
  url: string;
  messageId: string;
  chatId: string;
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'BUY' | 'SELL';
  amount: string;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proof?: TelegramOrderProof;
  transactionCode?: string;
  fiatCurrency?: 'KES';
  exchangeRate?: string;
  fiatTotal?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  amount: { type: String, required: true, match: /^\d+\.\d{6}$/ },
  status: { type: String, enum: ['PENDING', 'DONE', 'REJECTED'], default: 'PENDING', index: true },
  transactionCode: { type: String, trim: true },
  fiatCurrency: { type: String, enum: ['KES'], trim: true },
  exchangeRate: { type: String, match: /^\d+\.\d{6}$/ },
  fiatTotal: { type: String, match: /^\d+\.\d{2}$/ },
  proof: {
    type: {
      provider: { type: String, enum: ['telegram'] },
      url: { type: String, trim: true },
      messageId: { type: String, trim: true },
      chatId: { type: String, trim: true },
    },
    default: undefined,
  }
}, {
  timestamps: true
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
