import mongoose, { Document, Schema } from 'mongoose';

export interface IAuthSession extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  currentAccessTokenHash?: string | null;
  currentRefreshTokenHash?: string | null;
  absoluteExpiresAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  lastIp?: string | null;
  lastUserAgent?: string | null;
  revokedAt?: Date | null;
  revokeReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  deviceId: { type: String, required: true, index: true },
  currentAccessTokenHash: { type: String, default: null, index: true, sparse: true },
  currentRefreshTokenHash: { type: String, default: null, unique: true, sparse: true, index: true },
  absoluteExpiresAt: { type: Date, required: true, index: true },
  idleExpiresAt: { type: Date, required: true, index: true },
  lastSeenAt: { type: Date, required: true, default: () => new Date() },
  lastIp: { type: String, default: null },
  lastUserAgent: { type: String, default: null },
  revokedAt: { type: Date, default: null, index: true },
  revokeReason: { type: String, default: null },
}, {
  timestamps: true,
});

AuthSessionSchema.index({ userId: 1, deviceId: 1, revokedAt: 1 });

export const AuthSession = mongoose.model<IAuthSession>('AuthSession', AuthSessionSchema);
