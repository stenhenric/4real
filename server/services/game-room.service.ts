import type { IMatch } from '../models/Match.ts';
import type { MatchMoveDTO } from '../types/api.ts';
import { MATCH_COMMISSION_RATE, calculateProjectedWinnerAmount } from './match-payout.service.ts';
import { UserService } from './user.service.ts';

export interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string | null;
  elo: number;
}

export interface RoomState {
  roomId: string;
  players: RoomPlayer[];
  board: (string | null)[][];
  currentTurn: string | null;
  status: 'waiting' | 'active' | 'completed';
  moves: MatchMoveDTO[];
  wager: string;
  isPrivate: boolean;
  dbMatchId?: string;
  winnerId?: string;
  projectedWinnerAmount: string;
  commissionRate: string;
}

export function createEmptyBoard(): (string | null)[][] {
  return Array.from({ length: 6 }, () => Array<string | null>(7).fill(null));
}

export function buildBoardFromMoves(
  moveHistory: MatchMoveDTO[],
  player1Id: string,
  player2Id?: string,
): (string | null)[][] {
  const board = createEmptyBoard();

  for (const move of moveHistory) {
    const symbol = move.userId === player1Id ? 'R' : move.userId === player2Id ? 'B' : null;
    if (!symbol) {
      continue;
    }
    if (move.row >= 0 && move.row < 6 && move.col >= 0 && move.col < 7) {
      const boardRow = board[move.row];
      if (boardRow) {
        boardRow[move.col] = symbol;
      }
    }
  }

  return board;
}

export function determineCurrentTurn(match: IMatch): string | null {
  if (match.status !== 'active' || !match.player2Id) {
    return null;
  }

  return match.moveHistory.length % 2 === 0
    ? match.player1Id.toString()
    : match.player2Id.toString();
}

export async function createRoomStateFromMatch(match: IMatch): Promise<RoomState> {
  const normalizedMoves = (match.moveHistory ?? []).map((m) => ({
    userId: m.userId,
    col: m.col,
    row: m.row,
  }));

  const player1Id = match.player1Id.toString();
  const player2Id = match.player2Id?.toString();
  const [player1, player2] = await Promise.all([
    UserService.findById(player1Id),
    player2Id ? UserService.findById(player2Id) : Promise.resolve(null),
  ]);

  return {
    roomId: match.roomId,
    players: [
      {
        userId: player1Id,
        username: player1?.username ?? match.p1Username,
        socketId: null,
        elo: player1?.elo ?? 1000,
      },
      ...(player2Id ? [{
        userId: player2Id,
        username: player2?.username ?? match.p2Username ?? 'Opponent',
        socketId: null,
        elo: player2?.elo ?? 1000,
      }] : []),
    ],
    board: buildBoardFromMoves(normalizedMoves, player1Id, player2Id),
    currentTurn: determineCurrentTurn(match),
    status: match.status,
    moves: normalizedMoves,
    wager: match.wager ?? '0.000000',
    isPrivate: match.isPrivate ?? false,
    ...(match._id ? { dbMatchId: match._id.toString() } : {}),
    ...(match.winnerId ? { winnerId: match.winnerId } : {}),
    projectedWinnerAmount: calculateProjectedWinnerAmount(match.wager ?? '0.000000'),
    commissionRate: MATCH_COMMISSION_RATE,
  };
}

export function checkWin(board: (string | null)[][], row: number, col: number, symbol: string) {
  const directions: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
    const line: [number, number][] = [[row, col]];

    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const boardRow = board[r];
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && boardRow?.[c] === symbol) {
        count++;
        line.push([r, c]);
      } else {
        break;
      }
    }

    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      const boardRow = board[r];
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && boardRow?.[c] === symbol) {
        count++;
        line.push([r, c]);
      } else {
        break;
      }
    }

    if (count >= 4) {
      return line;
    }
  }

  return null;
}
