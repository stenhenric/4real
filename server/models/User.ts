import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  balance: number;
  elo: number;
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
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  balance: { type: Number, default: 0 },
  elo: { type: Number, default: 1000 },
  stats: {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
  },
  isAdmin: { type: Boolean, default: false }
}, {
  timestamps: true
});

export const User = mongoose.model<IUser>('User', UserSchema);
