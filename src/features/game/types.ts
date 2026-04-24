import type { MatchMoveDTO } from '../../types/api';

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
  wager: number;
  winnerId?: string;
  projectedWinnerAmount: number;
  commissionRate: number;
}

export interface GameOverState {
  winnerId: string;
  winningLine?: WinningLine;
}
