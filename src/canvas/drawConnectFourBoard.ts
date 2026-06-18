import rough from 'roughjs';
import type { BoardCell, WinningLine } from '../features/game/types';

type Board = BoardCell[][];

function themeColor(name: string, fallback: string) {
  if (typeof document === 'undefined') {
    return fallback;
  }

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function drawConnectFourBoard(
  canvas: HTMLCanvasElement,
  board: Board | undefined,
  winningLine?: WinningLine,
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
  const inset = Math.max(6, Math.min(cssWidth, cssHeight) * 0.035);
  const boardWidth = Math.max(0, cssWidth - inset * 2);
  const boardHeight = Math.max(0, cssHeight - inset * 2);
  const cellWidth = boardWidth / 7;
  const cellHeight = boardHeight / 6;
  const boardLine = themeColor('--color-game-board-line', 'navy');
  const redDisc = themeColor('--color-disc-red', 'red');
  const blueDisc = themeColor('--color-disc-blue', 'blue');

  // Grid lines
  for (let row = 0; row <= 6; row += 1) {
    const y = inset + row * cellHeight;
    generator.line(inset, y, inset + boardWidth, y, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  for (let column = 0; column <= 7; column += 1) {
    const x = inset + column * cellWidth;
    generator.line(x, inset, x, inset + boardHeight, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  // Winning-line highlight — drawn BEFORE discs so discs render on top
  winningLine?.forEach(([row, column]) => {
    generator.rectangle(inset + column * cellWidth + 5, inset + row * cellHeight + 5, cellWidth - 10, cellHeight - 10, {
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

      const centerX = inset + columnIndex * cellWidth + cellWidth / 2;
      const centerY = inset + rowIndex * cellHeight + cellHeight / 2;
      const radius = Math.min(cellWidth, cellHeight) * 0.35;

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
