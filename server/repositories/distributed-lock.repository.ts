import { getMongoCollection } from './mongo.repository.ts';

export interface DistributedLockDocument {
  resource: string;
  holder: string;
  acquiredAt: Date;
  expiresAt: Date;
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

export class DistributedLockRepository {
  private static collection() {
    return getMongoCollection<DistributedLockDocument>('distributed_locks');
  }

  static async acquire(
    resource: string,
    holder: string,
    ttlMs: number,
    now = new Date(),
  ): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      const result = await this.collection().updateOne(
        {
          resource,
          $or: [
            { expiresAt: { $lte: now } },
            { holder },
          ],
        },
        {
          $setOnInsert: {
            resource,
          },
          $set: {
            holder,
            acquiredAt: now,
            expiresAt,
          },
        },
        { upsert: true },
      );

      return result.matchedCount === 1 || result.upsertedCount === 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }

      throw error;
    }
  }

  static async renew(
    resource: string,
    holder: string,
    ttlMs: number,
    now = new Date(),
  ): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + ttlMs);
    const result = await this.collection().updateOne(
      {
        resource,
        holder,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          expiresAt,
        },
      },
    );

    return result.matchedCount === 1;
  }

  static async release(resource: string, holder: string): Promise<void> {
    await this.collection().deleteOne({ resource, holder });
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndex(
      { resource: 1 },
      { unique: true },
    );
  }
}
