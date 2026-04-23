import { Match, IMatch } from '../models/Match';
import { UserService } from './user.service';
import { TransactionService } from './transaction.service';
import type { MatchMoveDTO } from '../types/api';

export class MatchService {
  static async createMatch(matchData: Partial<IMatch>): Promise<IMatch> {
    const match = new Match(matchData);
    return match.save();
  }

  static async getActiveMatches(): Promise<IMatch[]> {
    return Match.find({ status: { $in: ['waiting', 'active'] }, isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(20).select('-__v');
  }

  static async getMatchByRoomId(roomId: string): Promise<IMatch | null> {
    return Match.findOne({ roomId });
  }

  static async completeMatch(roomId: string, winnerId: string, moveHistory: MatchMoveDTO[]): Promise<IMatch | null> {
    const match = await Match.findOneAndUpdate(
      { roomId },
      { status: 'completed', winnerId, moveHistory },
      { returnDocument: 'after' }
    );

    if (!match) {
      return null;
    }

    const p1IdStr = match.player1Id.toString();
    const p2IdStr = match.player2Id?.toString();

    await this.handleEloUpdate(p1IdStr, p2IdStr, winnerId);

    if (match.wager > 0) {
      await this.handleWagerPayout(roomId, match.wager, p1IdStr, p2IdStr, winnerId);
    }

    return match;
  }

  private static async handleEloUpdate(p1IdStr: string, p2IdStr: string | undefined, winnerId: string): Promise<void> {
    let p1 = await UserService.findById(p1IdStr);
    let p2 = p2IdStr ? await UserService.findById(p2IdStr) : null;

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

    await UserService.updateStatsAndElo(p1IdStr, eloChange1, p1Result);
    await UserService.updateStatsAndElo(p2IdStr, eloChange2, p2Result);
  }

  private static async handleWagerPayout(roomId: string, wager: number, p1IdStr: string, p2IdStr: string | undefined, winnerId: string): Promise<void> {
    if (winnerId !== 'draw') {
      // Calculate winnings
      const totalPot = wager * 2;
      const commission = totalPot * 0.1;
      const winAmount = totalPot - commission;

      await UserService.updateBalance(winnerId, winAmount);
      await TransactionService.createTransaction({ userId: winnerId, type: 'MATCH_WIN', amount: winAmount, referenceId: roomId });
      const loserId = p1IdStr === winnerId ? p2IdStr : p1IdStr;
      if (loserId) {
          await TransactionService.createTransaction({ userId: loserId, type: 'MATCH_LOSS', amount: -wager, referenceId: roomId });
      }
    } else {
      // Refund wagers on draw
      await UserService.updateBalance(p1IdStr, wager);
      await TransactionService.createTransaction({ userId: p1IdStr, type: 'MATCH_DRAW', amount: wager, referenceId: roomId });

      if (p2IdStr) {
        await UserService.updateBalance(p2IdStr, wager);
        await TransactionService.createTransaction({ userId: p2IdStr, type: 'MATCH_DRAW', amount: wager, referenceId: roomId });
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
