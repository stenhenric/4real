import type { MatchDTO, MatchMoveDTO, MatchOutcome, MatchRatingResultDTO } from '../../types/api';

export type BoardCell = 'R' | 'B' | null;
export type WinningLine = [number, number][];

export interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string | null;
  elo: number;
}

export interface RoomState {
  roomId: string;
  players: RoomPlayer[];
  board: BoardCell[][];
  currentTurn: string | null;
  status: 'waiting' | 'active' | 'completed';
  moves: MatchMoveDTO[];
  wager: MatchDTO['wager'];
  isPrivate?: boolean;
  winnerId?: string;
  settlementReason?: MatchDTO['settlementReason'];
  outcome?: MatchOutcome;
  ratingResult?: MatchRatingResultDTO;
  projectedWinnerAmount: NonNullable<MatchDTO['projectedWinnerAmount']>;
  commissionRate: NonNullable<MatchDTO['commissionRate']>;
}

export interface GameOverState {
  winnerId: string;
  outcome?: MatchOutcome;
  ratingResult?: MatchRatingResultDTO;
  winningLine?: WinningLine;
}
