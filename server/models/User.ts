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
  balance: string;
  elo: number;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
  avatar?: {
    preset?: string | null;
    color?: string | null;
  } | null;
  mfa: IUserMfaState;
  security: IUserSecurityState;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, default: undefined, trim: true },
  usernameNormalized: { type: String, default: undefined, unique: true, sparse: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, default: undefined, select: false },
  emailVerifiedAt: { type: Date, default: undefined, index: true },
  googleSubject: { type: String, default: undefined, unique: true, sparse: true },
  balance: { type: String, default: '0.000000', match: /^\d+\.\d{6}$/ },
  elo: { type: Number, default: 1000, min: 0 },
  stats: {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
  },
  avatar: {
    preset: { type: String, default: undefined },
    color: { type: String, default: undefined },
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
UserSchema.index(
  { elo: -1, username: 1, _id: 1, usernameNormalized: 1 },
  {
    name: 'leaderboard_public_by_elo',
    partialFilterExpression: {
      usernameNormalized: { $type: 'string' },
    },
  },
);

export const User = mongoose.model<IUser>('User', UserSchema);

export const SYSTEM_COMMISSION_ACCOUNT_ID = 'c03315510000000000000000';
