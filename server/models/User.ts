import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  balance: number;
  elo: number;
  tokenVersion: number;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true, index: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  balance: { type: Number, default: 0, min: 0 },
  elo: { type: Number, default: 1000, min: 0 },
  tokenVersion: { type: Number, default: 0, min: 0 },
  stats: {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
  },
  isAdmin: { type: Boolean, default: false }
}, {
  timestamps: true
});

UserSchema.index({ elo: -1 });

export const User = mongoose.model<IUser>('User', UserSchema);

export const SYSTEM_COMMISSION_ACCOUNT_ID = 'c03315510000000000000000';
