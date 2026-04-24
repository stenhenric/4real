import mongoose from 'mongoose';

import { Match } from '../models/Match.ts';
import type { IMatch } from '../models/Match.ts';
import { calculateMatchPayout } from './match-payout.service.ts';
import { UserService } from './user.service.ts';
import { TransactionService } from './transaction.service.ts';
import type { MatchMoveDTO } from '../types/api.ts';
import { emitPublicMatchUpdatedEvent } from '../sockets/public-match-events.ts';

export class MatchService {
  static async createMatch(matchData: Partial<IMatch>, session?: mongoose.ClientSession): Promise<IMatch> {
    const match = new Match(matchData);
    return match.save(session ? { session } : undefined);
  }

  static async getActiveMatches(): Promise<IMatch[]> {
    return Match.find({ status: { $in: ['waiting', 'active'] }, isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(20).select('-__v');
  }

  static async getMatchByRoomId(roomId: string, session?: mongoose.ClientSession): Promise<IMatch | null> {
    const query = Match.findOne({ roomId });
    return session ? query.session(session) : query;
  }

  static async persistMoveHistory(roomId: string, moveHistory: MatchMoveDTO[]): Promise<void> {
    await Match.updateOne(
      { roomId, status: 'active' },
      { $set: { moveHistory } }
    );
  }

  static async completeMatch(roomId: string, winnerId: string, moveHistory: MatchMoveDTO[]): Promise<IMatch | null> {
    const session = await mongoose.startSession();
    let settledMatch: IMatch | null = null;

    try {
      await session.withTransaction(async () => {
        const match = await this.getMatchByRoomId(roomId, session);
        if (!match) {
          settledMatch = null;
          return;
        }

        if (match.status === 'completed') {
          settledMatch = match;
          return;
        }

        const p1IdStr = match.player1Id.toString();
        const p2IdStr = match.player2Id?.toString();

        await this.handleEloUpdate(p1IdStr, p2IdStr, winnerId, session);

        if (match.wager > 0) {
          await this.handleWagerPayout(roomId, match.wager, p1IdStr, p2IdStr, winnerId, session);
        }

        match.status = 'completed';
        match.winnerId = winnerId;
        match.moveHistory = moveHistory;
        settledMatch = await match.save({ session });
      });

      if (settledMatch) {
        emitPublicMatchUpdatedEvent({
          roomId: settledMatch.roomId,
          status: settledMatch.status,
          isPrivate: settledMatch.isPrivate,
        });
      }

      return settledMatch;
    } finally {
      await session.endSession();
    }
  }

  private static async handleEloUpdate(
    p1IdStr: string,
    p2IdStr: string | undefined,
    winnerId: string,
    session: mongoose.ClientSession,
  ): Promise<void> {
    const p1 = await UserService.findById(p1IdStr, session);
    const p2 = p2IdStr ? await UserService.findById(p2IdStr, session) : null;

    if (!p1 || !p2 || !p2IdStr) {
      return;
    }

    const K = 32;
    const r1 = Math.pow(10, p1.elo / 400);
    const r2 = Math.pow(10, p2.elo / 400);
    const e1 = r1 / (r1 + r2);
    const e2 = r2 / (r1 + r2);

    let s1 = 0.5, s2 = 0.5; // Draw
    if (winnerId === p1IdStr) { s1 = 1; s2 = 0; }
    else if (winnerId === p2IdStr) { s1 = 0; s2 = 1; }

    const eloChange1 = Math.round(K * (s1 - e1));
    const eloChange2 = Math.round(K * (s2 - e2));

    let p1Result: 'win' | 'loss' | 'draw' = 'draw';
    let p2Result: 'win' | 'loss' | 'draw' = 'draw';

    if (winnerId === p1IdStr) {
      p1Result = 'win';
      p2Result = 'loss';
    } else if (winnerId === p2IdStr) {
      p1Result = 'loss';
      p2Result = 'win';
    }

    await UserService.updateStatsAndElo(p1IdStr, eloChange1, p1Result, session);
    await UserService.updateStatsAndElo(p2IdStr, eloChange2, p2Result, session);
  }

  private static async handleWagerPayout(
    roomId: string,
    wager: number,
    p1IdStr: string,
    p2IdStr: string | undefined,
    winnerId: string,
    session: mongoose.ClientSession,
  ): Promise<void> {
    if (winnerId !== 'draw') {
      const { projectedWinnerAmount } = calculateMatchPayout(wager);

      await UserService.updateBalance(winnerId, projectedWinnerAmount, session);
      await TransactionService.createTransaction({
        userId: winnerId,
        type: 'MATCH_WIN',
        amount: projectedWinnerAmount,
        referenceId: roomId,
        session,
      });
    } else {
      // Refund wagers on draw
      await UserService.updateBalance(p1IdStr, wager, session);
      await TransactionService.createTransaction({
        userId: p1IdStr,
        type: 'MATCH_DRAW',
        amount: wager,
        referenceId: roomId,
        session,
      });

      if (p2IdStr) {
        await UserService.updateBalance(p2IdStr, wager, session);
        await TransactionService.createTransaction({
          userId: p2IdStr,
          type: 'MATCH_DRAW',
          amount: wager,
          referenceId: roomId,
          session,
        });
      }
    }
  }

  static async getUserHistory(userId: string, limit: number = 5): Promise<IMatch[]> {
    return Match.find({
      $or: [{ player1Id: userId }, { player2Id: userId }],
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .limit(limit).select('-__v');
  }
}
