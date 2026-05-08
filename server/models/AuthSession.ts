import mongoose, { Document, Schema } from 'mongoose';

export interface IAuthSession extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  currentAccessTokenHash?: string | null | undefined;
  currentRefreshTokenHash?: string | null | undefined;
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

const REFRESH_TOKEN_INDEX_NAME = 'currentRefreshTokenHash_1';
const REFRESH_TOKEN_PARTIAL_FILTER = {
  currentRefreshTokenHash: { $type: 'string' },
} as const;

type MongoIndexDescription = {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: {
    currentRefreshTokenHash?: {
      $type?: unknown;
    };
  };
};

function hasExpectedRefreshTokenIndex(index: MongoIndexDescription): boolean {
  return index.unique === true
    && index.sparse !== true
    && index.partialFilterExpression?.currentRefreshTokenHash?.$type === 'string';
}

function hasMongoErrorCode(error: unknown, code: number): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}

async function readAuthSessionIndexes(): Promise<MongoIndexDescription[]> {
  try {
    return await AuthSession.collection.indexes() as MongoIndexDescription[];
  } catch (error) {
    if (hasMongoErrorCode(error, 26)) {
      return [];
    }
    throw error;
  }
}

async function dropLegacyRefreshTokenIndex(): Promise<void> {
  try {
    await AuthSession.collection.dropIndex(REFRESH_TOKEN_INDEX_NAME);
  } catch (error) {
    if (hasMongoErrorCode(error, 27)) {
      return;
    }
    throw error;
  }
}

const AuthSessionSchema = new Schema<IAuthSession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  deviceId: { type: String, required: true, index: true },
  currentAccessTokenHash: { type: String, default: undefined, index: true, sparse: true },
  currentRefreshTokenHash: { type: String, default: undefined },
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

AuthSessionSchema.index({ currentRefreshTokenHash: 1 }, {
  unique: true,
  partialFilterExpression: REFRESH_TOKEN_PARTIAL_FILTER,
});
AuthSessionSchema.index({ userId: 1, deviceId: 1, revokedAt: 1 });

export const AuthSession = mongoose.model<IAuthSession>('AuthSession', AuthSessionSchema);

export async function ensureAuthSessionIndexes(): Promise<void> {
  const existingIndexes = await readAuthSessionIndexes();
  const refreshTokenIndex = existingIndexes.find((index) => index.name === REFRESH_TOKEN_INDEX_NAME);
  if (refreshTokenIndex && !hasExpectedRefreshTokenIndex(refreshTokenIndex)) {
    await dropLegacyRefreshTokenIndex();
  }

  await AuthSession.createIndexes();
}
