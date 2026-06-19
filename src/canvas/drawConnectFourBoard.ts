import rough from 'roughjs';
import type { BoardCell, WinningLine } from '../features/game/types';

type Board = BoardCell[][];

export const CONNECT_FOUR_COLUMNS = 7;
export const CONNECT_FOUR_ROWS = 6;

export interface ConnectFourBoardLayout {
  inset: number;
  boardWidth: number;
  boardHeight: number;
  cellWidth: number;
  cellHeight: number;
}

export interface DrawConnectFourBoardOptions {
  inset?: number | 'auto';
}

function themeColor(name: string, fallback: string) {
  if (typeof document === 'undefined') {
    return fallback;
  }

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function toNonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function resolveInset(cssWidth: number, cssHeight: number, inset: DrawConnectFourBoardOptions['inset']): number {
  const shortestSide = Math.min(cssWidth, cssHeight);
  const requestedInset = inset === 'auto'
    ? Math.max(6, shortestSide * 0.035)
    : inset ?? 0;
  const maxInset = shortestSide / 2;

  return Math.min(maxInset, toNonNegativeFinite(requestedInset));
}

export function getConnectFourBoardLayout(
  cssWidth: number,
  cssHeight: number,
  options: DrawConnectFourBoardOptions = {},
): ConnectFourBoardLayout {
  const safeWidth = toNonNegativeFinite(cssWidth);
  const safeHeight = toNonNegativeFinite(cssHeight);
  const inset = resolveInset(safeWidth, safeHeight, options.inset);
  const boardWidth = Math.max(0, safeWidth - inset * 2);
  const boardHeight = Math.max(0, safeHeight - inset * 2);

  return {
    inset,
    boardWidth,
    boardHeight,
    cellWidth: boardWidth / CONNECT_FOUR_COLUMNS,
    cellHeight: boardHeight / CONNECT_FOUR_ROWS,
  };
}

export function getConnectFourHighlightRect(
  row: number,
  column: number,
  layout: ConnectFourBoardLayout,
) {
  const padding = Math.min(5, layout.cellWidth / 2, layout.cellHeight / 2);

  return {
    x: layout.inset + column * layout.cellWidth + padding,
    y: layout.inset + row * layout.cellHeight + padding,
    width: Math.max(0, layout.cellWidth - padding * 2),
    height: Math.max(0, layout.cellHeight - padding * 2),
  };
}

export function drawConnectFourBoard(
  canvas: HTMLCanvasElement,
  board: Board | undefined,
  winningLine?: WinningLine,
  options: DrawConnectFourBoardOptions = {},
) {
  const dpr = window.devicePixelRatio || 1;

  // Scale the canvas buffer to match the physical pixel count.
  // CSS size (clientWidth/clientHeight) stays unchanged, so layout is unaffected.
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  // Scale all drawing operations so we can keep using CSS-pixel coordinates.
  context.scale(dpr, dpr);
  context.clearRect(0, 0, cssWidth, cssHeight);

  if (!board) {
    return;
  }

  const generator = rough.canvas(canvas);
  const layout = getConnectFourBoardLayout(cssWidth, cssHeight, options);
  const boardLine = themeColor('--color-game-board-line', 'navy');
  const redDisc = themeColor('--color-disc-red', 'red');
  const blueDisc = themeColor('--color-disc-blue', 'blue');

  // Grid lines
  for (let row = 0; row <= CONNECT_FOUR_ROWS; row += 1) {
    const y = layout.inset + row * layout.cellHeight;
    generator.line(layout.inset, y, layout.inset + layout.boardWidth, y, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  for (let column = 0; column <= CONNECT_FOUR_COLUMNS; column += 1) {
    const x = layout.inset + column * layout.cellWidth;
    generator.line(x, layout.inset, x, layout.inset + layout.boardHeight, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  // Winning-line highlight — drawn BEFORE discs so discs render on top
  winningLine?.forEach(([row, column]) => {
    const rect = getConnectFourHighlightRect(row, column, layout);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    generator.rectangle(rect.x, rect.y, rect.width, rect.height, {
      fill: themeColor('--color-marker-yellow', 'yellow'),
      fillStyle: 'solid',
      roughness: 3,
      stroke: 'transparent',
    });
  });

  // Discs
  board.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell) {
        return;
      }

      const centerX = layout.inset + columnIndex * layout.cellWidth + layout.cellWidth / 2;
      const centerY = layout.inset + rowIndex * layout.cellHeight + layout.cellHeight / 2;
      const radius = Math.min(layout.cellWidth, layout.cellHeight) * 0.35;

      generator.circle(centerX, centerY, radius * 2, {
        fill: cell === 'R' ? redDisc : blueDisc,
        fillStyle: 'cross-hatch',
        hachureGap: 3,
        roughness: 2,
        stroke: cell === 'R' ? redDisc : blueDisc,
      });
    });
  });
}
