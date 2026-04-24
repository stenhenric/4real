import mongoose, { Document, Schema } from 'mongoose';

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'BUY' | 'SELL';
  amount: number;
  status: 'PENDING' | 'DONE' | 'REJECTED';
  proofImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['PENDING', 'DONE', 'REJECTED'], default: 'PENDING', index: true },
  proofImageUrl: { type: String, trim: true }
}, {
  timestamps: true
});

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
