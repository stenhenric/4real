import rough from 'roughjs';
import type { BoardCell, WinningLine } from '../features/game/types';

type Board = BoardCell[][];

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

  for (let row = 0; row <= 6; row += 1) {
    generator.line(0, row * cellHeight, canvas.width, row * cellHeight, {
      roughness: 1.2,
      stroke: '#4338ca',
      strokeWidth: 1.5,
    });
  }

  for (let column = 0; column <= 7; column += 1) {
    generator.line(column * cellWidth, 0, column * cellWidth, canvas.height, {
      roughness: 1.2,
      stroke: '#4338ca',
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
        fill: cell === 'R' ? '#ef4444' : '#3b82f6',
        fillStyle: 'cross-hatch',
        hachureGap: 3,
        roughness: 2,
        stroke: cell === 'R' ? '#ef4444' : '#3b82f6',
      });
    });
  });

  winningLine?.forEach(([row, column]) => {
    generator.rectangle(column * cellWidth + 5, row * cellHeight + 5, cellWidth - 10, cellHeight - 10, {
      fill: 'rgba(255, 235, 59, 0.4)',
      fillStyle: 'solid',
      roughness: 3,
      stroke: 'transparent',
    });
  });
}
