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
    actorUserId?: string | null | undefined;
    targetUserId?: string | null | undefined;
    resourceType: string;
    resourceId: string;
    requestId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
    session?: mongoose.ClientSession | undefined;
  }): Promise<void> {
    await AuditEventRepository.create({
      eventType: params.eventType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ...(params.actorUserId != null ? { actorUserId: params.actorUserId } : {}),
      ...(params.targetUserId != null ? { targetUserId: params.targetUserId } : {}),
      ...(params.requestId !== undefined ? { requestId: params.requestId } : {}),
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      createdAt: new Date(),
    }, params.session);
  }
}
