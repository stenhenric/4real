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
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!board) {
    return;
  }

  const generator = rough.canvas(canvas);
  const cellWidth = canvas.width / 7;
  const cellHeight = canvas.height / 6;
  const boardLine = themeColor('--color-game-board-line', 'navy');
  const redDisc = themeColor('--color-disc-red', 'red');
  const blueDisc = themeColor('--color-disc-blue', 'blue');

  for (let row = 0; row <= 6; row += 1) {
    generator.line(0, row * cellHeight, canvas.width, row * cellHeight, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  for (let column = 0; column <= 7; column += 1) {
    generator.line(column * cellWidth, 0, column * cellWidth, canvas.height, {
      roughness: 1.2,
      stroke: boardLine,
      strokeWidth: 1.5,
    });
  }

  board.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell) {
        return;
      }

      const centerX = columnIndex * cellWidth + cellWidth / 2;
      const centerY = rowIndex * cellHeight + cellHeight / 2;
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

  winningLine?.forEach(([row, column]) => {
    generator.rectangle(column * cellWidth + 5, row * cellHeight + 5, cellWidth - 10, cellHeight - 10, {
      fill: themeColor('--color-marker-yellow', 'yellow'),
      fillStyle: 'solid',
      roughness: 3,
      stroke: 'transparent',
    });
  });
}
