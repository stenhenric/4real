import rough from 'roughjs';

interface DrawRoughRectangleOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  fillStyle: 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed';
  stroke: string;
  strokeWidth: number;
  roughness: number;
  hachureGap: number;
  fillWeight?: number;
}

export function drawRoughRectangle(canvas: HTMLCanvasElement, options: DrawRoughRectangleOptions) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const generator = rough.canvas(canvas);
  generator.rectangle(options.x, options.y, options.width, options.height, {
    fill: options.fill,
    fillStyle: options.fillStyle,
    fillWeight: options.fillWeight,
    hachureGap: options.hachureGap,
    roughness: options.roughness,
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
  });
}
