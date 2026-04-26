import mongoose, { Document, Schema } from 'mongoose';

export interface IMerchantConfig extends Document {
  singletonKey: string;
  mpesaNumber: string;
  walletAddress: string;
  instructions: string;
  fiatCurrency: 'KES';
  buyRateKesPerUsdt: number;
  sellRateKesPerUsdt: number;
  createdAt: Date;
  updatedAt: Date;
}

const MerchantConfigSchema = new Schema(
  {
    singletonKey: { type: String, required: true, unique: true, index: true },
    mpesaNumber: { type: String, required: true, trim: true },
    walletAddress: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
    fiatCurrency: { type: String, enum: ['KES'], required: true, default: 'KES' },
    buyRateKesPerUsdt: { type: Number, required: true, min: 0 },
    sellRateKesPerUsdt: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
  },
);

export const MerchantConfig = mongoose.model<IMerchantConfig>('MerchantConfig', MerchantConfigSchema);
