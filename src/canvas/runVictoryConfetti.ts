import canvasConfetti from 'canvas-confetti';
import { resolveCanvasColor } from './resolveCanvasColor';

export function runVictoryConfetti() {
  const duration = 3000;
  const endTime = Date.now() + duration;
  const colors = [
    resolveCanvasColor('var(--color-disc-red)', 'red'),
    resolveCanvasColor('var(--color-disc-blue)', 'blue'),
    resolveCanvasColor('var(--color-note-yellow)', 'yellow'),
  ];

  const frame = () => {
    canvasConfetti({
      angle: 60,
      colors,
      origin: { x: 0 },
      particleCount: 5,
      spread: 55,
    });

    canvasConfetti({
      angle: 120,
      colors,
      origin: { x: 1 },
      particleCount: 5,
      spread: 55,
    });

    if (Date.now() < endTime) {
      requestAnimationFrame(frame);
    }
  };

  frame();
}
