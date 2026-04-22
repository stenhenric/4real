import { Match, IMatch } from '../models/Match';
import { UserService } from './user.service';

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

  static async completeMatch(roomId: string, winnerId: string, moveHistory: any[]): Promise<IMatch | null> {
    const match = await Match.findOneAndUpdate(
      { roomId },
      { status: 'completed', winnerId, moveHistory },
      { new: true }
    );

    if (match && match.wager > 0) {
      if (winnerId !== 'draw') {
        // Calculate winnings
        const totalPot = match.wager * 2;
        const commission = totalPot * 0.1;
        const winAmount = totalPot - commission;

        await UserService.updateBalance(winnerId, winAmount);
        // We might also update ELO here, but MVP logic seems to be sufficient for now
      } else {
        // Refund wagers on draw
        if (match.player1Id) {
          await UserService.updateBalance(match.player1Id.toString(), match.wager);
        }
        if (match.player2Id) {
          await UserService.updateBalance(match.player2Id.toString(), match.wager);
        }
      }
    }

    return match;
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
