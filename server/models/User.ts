import mongoose, { Document, Schema } from 'mongoose';

export interface IUserMfaState {
  totpSecretEncrypted?: string | null;
  enabledAt?: Date | null;
  recoveryCodeHashes: string[];
}

export interface IUserSecurityState {
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
  lastLoginUserAgent?: string | null;
  lastSuspiciousLoginAt?: Date | null;
}

export interface IUser extends Document {
  username?: string | null;
  usernameNormalized?: string | null;
  email: string;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
  googleSubject?: string | null;
  balance: number;
  elo: number;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
  mfa: IUserMfaState;
  security: IUserSecurityState;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, default: null, trim: true },
  usernameNormalized: { type: String, default: null, unique: true, sparse: true, index: true },
  email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  passwordHash: { type: String, default: null },
  emailVerifiedAt: { type: Date, default: null, index: true },
  googleSubject: { type: String, default: null, unique: true, sparse: true, index: true },
  balance: { type: Number, default: 0, min: 0 },
  elo: { type: Number, default: 1000, min: 0 },
  stats: {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
  },
  mfa: {
    totpSecretEncrypted: { type: String, default: null },
    enabledAt: { type: Date, default: null },
    recoveryCodeHashes: { type: [String], default: [] },
  },
  security: {
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginUserAgent: { type: String, default: null },
    lastSuspiciousLoginAt: { type: Date, default: null },
  },
  isAdmin: { type: Boolean, default: false },
}, {
  timestamps: true,
});

UserSchema.index({ elo: -1 });
UserSchema.index({ usernameNormalized: 1 }, {
  unique: true,
  sparse: true,
});

export const User = mongoose.model<IUser>('User', UserSchema);

export const SYSTEM_COMMISSION_ACCOUNT_ID = 'c03315510000000000000000';
