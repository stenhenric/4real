import { getMongoCollection } from './mongo.repository.ts';

export interface PollerStateDocument {
  key: string;
  lastProcessedTime?: number;
  updatedAt: Date;
}

export class PollerStateRepository {
  private static collection() {
    return getMongoCollection<PollerStateDocument>('poller_state');
  }

  static async findByKey(key: string) {
    return this.collection().findOne({ key });
  }

  static async setLastProcessedTime(key: string, lastProcessedTime: number): Promise<void> {
    await this.collection().updateOne(
      { key },
      { $set: { lastProcessedTime, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { key: 1 }, unique: true },
    ]);
  }
}
