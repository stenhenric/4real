import type mongoose from 'mongoose';

import { getMongoCollection } from './mongo.repository.ts';

export interface AuditEventDocument {
  eventType: string;
  actorUserId?: string;
  targetUserId?: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export class AuditEventRepository {
  private static collection() {
    return getMongoCollection<AuditEventDocument>('audit_events');
  }

  static async create(document: AuditEventDocument, session?: mongoose.ClientSession): Promise<void> {
    await this.collection().insertOne(document, session ? { session } : undefined);
  }

  static async ensureIndexes(): Promise<void> {
    await this.collection().createIndexes([
      { key: { eventType: 1, createdAt: -1 } },
      { key: { actorUserId: 1, createdAt: -1 } },
      { key: { resourceType: 1, resourceId: 1, createdAt: -1 } },
    ]);
  }
}
