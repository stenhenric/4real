import mongoose, { Document, Schema } from 'mongoose';

export interface TelegramOrderProof {
  provider: 'telegram';
  url: string;
  messageId: string;
  chatId: string;
}

export interface OrderProofUpload {
  checksumSha256: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploaderUserId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'BUY' | 'SELL';
  amount: string;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proof?: TelegramOrderProof;
  proofUpload?: OrderProofUpload;
  transactionCode?: string;
  transactionCodeOriginal?: string;
  transactionCodeNormalized?: string;
  mpesaCodeValidationReason?: string;
  mpesaCodeDecodedDate?: Date;
  mpesaCodeAttemptCount?: number;
  mpesaCodeLockedUntil?: Date;
  fiatCurrency?: 'KES';
  exchangeRate?: string;
  fiatTotal?: string;
  mpesaNumber?: string;
  mpesaName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  amount: { type: String, required: true, match: /^\d+\.\d{6}$/ },
  status: { type: String, enum: ['PENDING', 'DONE', 'REJECTED'], default: 'PENDING', index: true },
  transactionCode: { type: String, trim: true },
  transactionCodeOriginal: { type: String, trim: true },
  transactionCodeNormalized: { type: String, trim: true, uppercase: true },
  mpesaCodeValidationReason: { type: String, trim: true },
  mpesaCodeDecodedDate: { type: Date },
  mpesaCodeAttemptCount: { type: Number, min: 0 },
  mpesaCodeLockedUntil: { type: Date },
  fiatCurrency: { type: String, enum: ['KES'], trim: true },
  exchangeRate: { type: String, match: /^\d+\.\d{6}$/ },
  fiatTotal: { type: String, match: /^\d+\.\d{2}$/ },
  mpesaNumber: { type: String, trim: true },
  mpesaName: { type: String, trim: true },
  proof: {
    type: {
      provider: { type: String, enum: ['telegram'] },
      url: { type: String, trim: true },
      messageId: { type: String, trim: true },
      chatId: { type: String, trim: true },
    },
    default: undefined,
  },
  proofUpload: {
    type: {
      checksumSha256: { type: String, trim: true, required: true },
      mimeType: { type: String, trim: true, required: true },
      sizeBytes: { type: Number, min: 1, required: true },
      storageKey: { type: String, trim: true, required: true },
      uploaderUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, required: true },
    },
    default: undefined,
  },
}, {
  timestamps: true
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ type: 1, createdAt: -1 });
OrderSchema.index({ status: 1, type: 1, createdAt: -1 });
OrderSchema.index(
  { transactionCodeNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'BUY',
      transactionCodeNormalized: { $type: 'string' },
    },
  },
);

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
