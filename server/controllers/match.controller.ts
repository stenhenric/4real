import crypto from 'node:crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';

import type { AuthRequest } from '../middleware/auth.middleware.ts';
import type { IMatch } from '../models/Match.ts';
import { serializeMatch } from '../serializers/api.ts';
import { MatchService } from '../services/match.service.ts';
import { TransactionService } from '../services/transaction.service.ts';
import { UserService } from '../services/user.service.ts';
import { emitPublicMatchUpdatedEvent } from '../sockets/public-match-events.ts';
import { notFound, unauthorized, badRequest } from '../utils/http-error.ts';
import type { CreateMatchRequest } from '../validation/request-schemas.ts';

export class MatchController {
  static async getActiveMatches(_req: Request, res: Response): Promise<void> {
    const matches = await MatchService.getActiveMatches();
    res.json(matches.map((match) => serializeMatch(match)));
  }

  static async createMatch(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw unauthorized('Unauthenticated');
    }

    const { wager, isPrivate } = req.body as CreateMatchRequest;
    const roomId = crypto.randomBytes(3).toString('hex');
    const session = await mongoose.startSession();
    let match: IMatch | null = null;

    try {
      await session.withTransaction(async () => {
        const user = await UserService.findById(req.user!.id, session);
        if (!user) {
          throw notFound('User not found');
        }

        if (wager > 0) {
          const updatedUser = await UserService.deductBalanceSafely(user._id.toString(), wager, session);
          if (!updatedUser) {
            throw badRequest('INSUFFICIENT_BALANCE');
          }

          await TransactionService.createTransaction({
            userId: user._id.toString(),
            type: 'MATCH_WAGER',
            amount: -wager,
            referenceId: roomId,
            session,
          });
        }

        match = await MatchService.createMatch({
          roomId,
          player1Id: user._id,
          p1Username: user.username,
          wager: wager || 0,
          isPrivate: isPrivate || false,
          status: 'waiting',
          moveHistory: [],
        }, session);
      });
    } finally {
      await session.endSession();
    }

    if (!match) {
      throw new Error('Unable to create match');
    }

    emitPublicMatchUpdatedEvent({
      roomId: match.roomId,
      status: match.status,
      isPrivate: match.isPrivate,
    });

    res.status(201).json(serializeMatch(match));
  }

  static async getUserHistory(req: Request, res: Response): Promise<void> {
    const matches = await MatchService.getUserHistory(req.params.userId);
    res.json(matches.map((match) => serializeMatch(match)));
  }
}
