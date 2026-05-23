import type { MatchMoveDTO } from '../../types/api';

export const MINI_MATCH_BOARD_COLUMNS = 7;
export const MINI_MATCH_BOARD_ROWS = 6;

export type MiniMatchCellOwner = 'player1' | 'player2' | null;

export interface MiniMatchBoardCell {
  row: number;
  col: number;
  owner: MiniMatchCellOwner;
}

function isValidCoordinate(move: MatchMoveDTO): boolean {
  return Number.isInteger(move.row)
    && Number.isInteger(move.col)
    && move.row >= 0
    && move.row < MINI_MATCH_BOARD_ROWS
    && move.col >= 0
    && move.col < MINI_MATCH_BOARD_COLUMNS;
}

function getMoveOwner(move: MatchMoveDTO, player1Id: string, player2Id?: string): MiniMatchCellOwner {
  if (move.userId === player1Id) {
    return 'player1';
  }

  if (player2Id && move.userId === player2Id) {
    return 'player2';
  }

  return null;
}

export function buildMiniMatchBoardCells(
  moveHistory: MatchMoveDTO[] | undefined,
  player1Id: string,
  player2Id?: string,
): MiniMatchBoardCell[] {
  const cells = Array.from({ length: MINI_MATCH_BOARD_ROWS * MINI_MATCH_BOARD_COLUMNS }, (_, index) => ({
    row: Math.floor(index / MINI_MATCH_BOARD_COLUMNS),
    col: index % MINI_MATCH_BOARD_COLUMNS,
    owner: null as MiniMatchCellOwner,
  }));

  for (const move of moveHistory ?? []) {
    if (!isValidCoordinate(move)) {
      continue;
    }

    const owner = getMoveOwner(move, player1Id, player2Id);
    if (!owner) {
      continue;
    }

    cells[move.row * MINI_MATCH_BOARD_COLUMNS + move.col] = {
      row: move.row,
      col: move.col,
      owner,
    };
  }

  return cells;
}

export function getMiniMatchDiscClass(owner: MiniMatchCellOwner): string | undefined {
  if (owner === 'player1') {
    return 'disc-red border-0';
  }

  if (owner === 'player2') {
    return 'disc-blue border-0';
  }

  return undefined;
}
