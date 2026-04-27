import { AuditEventRepository } from '../repositories/audit-event.repository.ts';
import type mongoose from 'mongoose';

export type AuditEventType =
  | 'deposit_credit'
  | 'deposit_reconciled'
  | 'deposit_dismissed'
  | 'deposit_rejected'
  | 'withdrawal_requested'
  | 'withdrawal_sent'
  | 'withdrawal_confirmed'
  | 'match_wager_locked'
  | 'match_refund'
  | 'match_payout'
  | 'order_created'
  | 'order_approved'
  | 'order_rejected';

export class AuditService {
  static async record(params: {
    eventType: AuditEventType;
    actorUserId?: string | null;
    targetUserId?: string | null;
    resourceType: string;
    resourceId: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
    session?: mongoose.ClientSession;
  }): Promise<void> {
    await AuditEventRepository.create({
      eventType: params.eventType,
      actorUserId: params.actorUserId ?? undefined,
      targetUserId: params.targetUserId ?? undefined,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      requestId: params.requestId,
      metadata: params.metadata,
      createdAt: new Date(),
    }, params.session);
  }
}
