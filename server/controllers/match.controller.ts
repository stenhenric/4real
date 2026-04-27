import type { Request, Response } from 'express';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import { serializeMatch } from '../serializers/api.ts';
import { executeIdempotentMutation } from '../services/idempotency.service.ts';
import { MatchService } from '../services/match.service.ts';
import { getRequiredIdempotencyKey } from '../utils/idempotency.ts';
import { notFound, unauthorized } from '../utils/http-error.ts';
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
  static async getActiveMatches(_req: Request, res: Response): Promise<void> {
    const matches = await MatchService.getActiveMatches();
    res.json(matches.map((match) => serializeMatch(match)));
  }

  static async getMatch(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const match = await MatchService.getAccessibleMatch({
      roomId: req.params.roomId,
      userId: req.user.id,
      inviteToken: getInviteTokenFromQuery(req),
    });
    if (!match) {
      throw notFound('Match not found', 'MATCH_NOT_FOUND');
    }

    res.json(serializeMatch(match));
  }

  static async createMatch(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const { wager, isPrivate } = req.body as CreateMatchRequest;
    const idempotencyKey = getRequiredIdempotencyKey(req);

    const result = await executeIdempotentMutation({
      userId: req.user.id,
      routeKey: 'matches:create',
      idempotencyKey,
      requestPayload: { wager, isPrivate },
      execute: async () => {
        const createdMatch = await MatchService.createMatchForUser({
          userId: req.user!.id,
          wager: wager || 0,
          isPrivate: isPrivate || false,
          requestId: res.locals.requestId,
        });

        return {
          statusCode: 201,
          body: serializeMatch(createdMatch.match, {
            inviteUrl: createdMatch.inviteUrl,
          }),
        };
      },
    });

    res.status(result.statusCode).json(result.body);
  }

  static async joinMatch(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const idempotencyKey = getRequiredIdempotencyKey(req);
    const roomId = req.params.roomId;
    const inviteToken = getInviteTokenFromHeader(req);

    const result = await executeIdempotentMutation({
      userId: req.user.id,
      routeKey: `matches:join:${roomId}`,
      idempotencyKey,
      requestPayload: {
        roomId,
        inviteTokenHash: inviteToken ? MatchService.hashInviteToken(inviteToken) : null,
      },
      execute: async () => {
        const match = await MatchService.joinMatch({
          roomId,
          userId: req.user!.id,
          inviteToken,
          requestId: res.locals.requestId,
        });

        return {
          statusCode: 200,
          body: serializeMatch(match),
        };
      },
    });

    res.status(result.statusCode).json(result.body);
  }

  static async resignMatch(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated', 'UNAUTHENTICATED');
    }

    const idempotencyKey = getRequiredIdempotencyKey(req);
    const roomId = req.params.roomId;

    const result = await executeIdempotentMutation({
      userId: req.user.id,
      routeKey: `matches:resign:${roomId}`,
      idempotencyKey,
      requestPayload: { roomId },
      execute: async () => {
        const match = await MatchService.resignMatch({
          roomId,
          userId: req.user!.id,
          requestId: res.locals.requestId,
        });

        return {
          statusCode: 200,
          body: serializeMatch(match),
        };
      },
    });

    res.status(result.statusCode).json(result.body);
  }

  static async getUserHistory(req: Request, res: Response): Promise<void> {
    const matches = await MatchService.getUserHistory(req.params.userId);
    res.json(matches.map((match) => serializeMatch(match)));
  }
}
