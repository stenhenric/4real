import { useEffect, useRef, type ReactNode } from 'react';
import { drawRoughRectangle } from '../canvas/drawRoughRectangle';
import { useElementSize } from '../hooks/useElementSize';
import { cn } from '../utils/cn';

interface SketchyContainerProps {
  children: ReactNode;
  className?: string;
  fill?: string;
  fillStyle?: 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed';
  stroke?: string;
  strokeWidth?: number;
  roughness?: number;
}

export const SketchyContainer = ({ 
  children, 
  className,
  fill = 'transparent',
  fillStyle = 'hachure',
  stroke = '#1a1a1a',
  strokeWidth = 2,
  roughness = 1.5
}: SketchyContainerProps) => {
  const { elementRef, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }

    drawRoughRectangle(canvas, {
      x: 5,
      y: 5,
      width: size.width - 10,
      height: size.height - 10,
      fill,
      fillStyle,
      fillWeight: 1,
      hachureGap: 6,
      roughness,
      stroke,
      strokeWidth,
    });
  }, [fill, fillStyle, roughness, size.height, size.width, stroke, strokeWidth]);

  return (
    <div ref={elementRef} className={cn("relative p-4", className)}>
      <canvas 
        ref={canvasRef} 
        width={size.width} 
        height={size.height} 
        className="absolute top-0 left-0 pointer-events-none z-0"
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
