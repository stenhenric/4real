import canvasConfetti from 'canvas-confetti';

export function runVictoryConfetti() {
  const duration = 3000;
  const endTime = Date.now() + duration;

  const frame = () => {
    canvasConfetti({
      angle: 60,
      colors: ['#ef4444', '#3b82f6', '#fef08a'],
      origin: { x: 0 },
      particleCount: 5,
      spread: 55,
    });

    canvasConfetti({
      angle: 120,
      colors: ['#ef4444', '#3b82f6', '#fef08a'],
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
