import mongoose, { Document, Schema } from 'mongoose';

export type OneTimeTokenType =
  | 'email_verification'
  | 'password_reset'
  | 'magic_link'
  | 'suspicious_login';

export interface IOneTimeToken extends Document {
  userId: mongoose.Types.ObjectId;
  type: OneTimeTokenType;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const OneTimeTokenSchema = new Schema<IOneTimeToken>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  type: {
    type: String,
    required: true,
    enum: ['email_verification', 'password_reset', 'magic_link', 'suspicious_login'],
    index: true,
  },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null, index: true },
  metadata: { type: Schema.Types.Mixed, default: null },
}, {
  timestamps: true,
});

OneTimeTokenSchema.index({ userId: 1, type: 1, consumedAt: 1, expiresAt: 1 });

export const OneTimeToken = mongoose.model<IOneTimeToken>('OneTimeToken', OneTimeTokenSchema);
