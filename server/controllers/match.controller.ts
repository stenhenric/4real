import type { Request, Response } from 'express';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { assertAuthenticated } from '../middleware/auth.middleware.ts';
import { serializeMatch } from '../serializers/api.ts';
import { emitPublicMatchUpdatedEvent } from '../sockets/public-match-events.ts';
import { executeIdempotentMutationV2 } from '../services/idempotency.service.ts';
import { MatchService } from '../services/match.service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import { badRequest, notFound } from '../utils/http-error.ts';
import type { CreateMatchRequest } from '../validation/request-schemas.ts';

function getInviteTokenFromQuery(req: Request): string | undefined {
  const invite = req.query?.invite;
  if (typeof invite !== 'string') {
    return undefined;
  }

  const trimmed = invite.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getInviteTokenFromHeader(req: Request): string | undefined {
  const invite = req.get('x-match-invite');
  if (!invite) {
    return undefined;
  }

  const trimmed = invite.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class MatchController {
  private static getRequiredRoomId(req: Request): string {
    const roomId = req.params.roomId;
    if (!roomId) {
      throw badRequest('Room id is required', 'MATCH_ROOM_REQUIRED');
    }

    return roomId;
  }

  static async getActiveMatches(_req: Request, res: Response): Promise<void> {
    const matches = await MatchService.getActiveMatches();
    res.json(matches.map((match) => serializeMatch(match)));
  }

  static async getMatch(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const inviteToken = getInviteTokenFromQuery(req);
    const match = await MatchService.getAccessibleMatch({
      roomId: MatchController.getRequiredRoomId(req),
      userId: req.user.id,
      ...(inviteToken ? { inviteToken } : {}),
    });
    if (!match) {
      throw notFound('Match not found', 'MATCH_NOT_FOUND');
    }

    res.json(serializeMatch(match));
  }

  static async createMatch(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const userId = req.user.id;
    const { wager, isPrivate } = req.body as CreateMatchRequest;
    const idempotencyKey = getRequiredIdempotencyKey(req);
    const result = await executeIdempotentMutationV2({
      userId,
      routeKey: 'matches:create',
      idempotencyKey,
      requestPayload: { wager, isPrivate },
      execute: async ({ session }) => {
        const createdMatch = await MatchService.createMatchForUser({
          userId,
          wager: wager || 0,
          isPrivate: isPrivate || false,
          requestId: res.locals.requestId,
          session,
          emitPublicEvent: false,
        });
        return {
          statusCode: 201,
          body: serializeMatch(
            createdMatch.match,
            createdMatch.inviteUrl ? { inviteUrl: createdMatch.inviteUrl } : undefined,
          ),
        };
      },
    });

    if (!result.replayed) {
      emitPublicMatchUpdatedEvent({
        roomId: result.body.roomId,
        status: result.body.status,
        isPrivate: result.body.isPrivate,
      });
    }

    res.status(result.statusCode).json(result.body);
  }

  static async joinMatch(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const userId = req.user.id;
    const idempotencyKey = getRequiredIdempotencyKey(req);
    const roomId = MatchController.getRequiredRoomId(req);
    const inviteToken = getInviteTokenFromHeader(req);
    const result = await executeIdempotentMutationV2({
      userId,
      routeKey: `matches:join:${roomId}`,
      idempotencyKey,
      requestPayload: {
        roomId,
        inviteTokenHash: inviteToken ? MatchService.hashInviteToken(inviteToken) : null,
      },
      execute: async ({ session }) => {
        const match = await MatchService.joinMatch({
          roomId,
          userId,
          ...(inviteToken ? { inviteToken } : {}),
          requestId: res.locals.requestId,
          session,
          emitPublicEvent: false,
        });
        return {
          statusCode: 200,
          body: serializeMatch(match),
        };
      },
    });

    if (!result.replayed) {
      emitPublicMatchUpdatedEvent({
        roomId: result.body.roomId,
        status: result.body.status,
        isPrivate: result.body.isPrivate,
      });
    }

    res.status(result.statusCode).json(result.body);
  }

  static async resignMatch(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const userId = req.user.id;
    const idempotencyKey = getRequiredIdempotencyKey(req);
    const roomId = MatchController.getRequiredRoomId(req);
    const result = await executeIdempotentMutationV2({
      userId,
      routeKey: `matches:resign:${roomId}`,
      idempotencyKey,
      requestPayload: { roomId },
      execute: async ({ session }) => {
        const match = await MatchService.resignMatch({
          roomId,
          userId,
          requestId: res.locals.requestId,
          session,
          emitPublicEvent: false,
        });
        return {
          statusCode: 200,
          body: serializeMatch(match),
        };
      },
    });

    if (!result.replayed) {
      emitPublicMatchUpdatedEvent({
        roomId: result.body.roomId,
        status: result.body.status,
        isPrivate: result.body.isPrivate,
      });
    }

    res.status(result.statusCode).json(result.body);
  }

  static async getUserHistory(req: Request, res: Response): Promise<void> {
    const userId = req.params.userId;
    if (!userId) {
      throw badRequest('User id is required', 'USER_ID_REQUIRED');
    }

    const matches = await MatchService.getUserHistory(userId);
    res.json(matches.map((match) => serializeMatch(match)));
  }
}
