import type { OneTimeTokenType } from '../models/OneTimeToken.ts';
import { OneTimeToken } from '../models/OneTimeToken.ts';
import { createOpaqueToken, hashOpaqueToken } from './auth-crypto.service.ts';
import { unauthorized } from '../utils/http-error.ts';

export class OneTimeTokenService {
  static async create(params: {
    userId: string;
    type: OneTimeTokenType;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }) {
    const rawToken = createOpaqueToken();
    await OneTimeToken.create({
      userId: params.userId,
      type: params.type,
      tokenHash: hashOpaqueToken(rawToken),
      expiresAt: params.expiresAt,
      metadata: params.metadata ?? null,
    });

    return rawToken;
  }

  static async consume(type: OneTimeTokenType, token: string) {
    const now = new Date();
    const document = await OneTimeToken.findOneAndUpdate(
      {
        type,
        tokenHash: hashOpaqueToken(token),
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: now } },
      { new: true },
    );

    if (!document) {
      throw unauthorized('This link is invalid or has expired', 'INVALID_OR_EXPIRED_LINK');
    }

    return document;
  }

  static async revokeActiveTokensForUser(userId: string, types: OneTimeTokenType[]): Promise<void> {
    await OneTimeToken.updateMany(
      {
        userId,
        type: { $in: types },
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
    );
  }

  static async revoke(type: OneTimeTokenType, token: string): Promise<void> {
    await OneTimeToken.updateOne(
      {
        type,
        tokenHash: hashOpaqueToken(token),
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
    );
  }
}
