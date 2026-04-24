import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { drawRoughRectangle } from '../canvas/drawRoughRectangle';
import { useElementSize } from '../hooks/useElementSize';
import { cn } from '../utils/cn';

type SketchyButtonProps = React.ComponentProps<'button'> & {
  fill?: string;
  stroke?: string;
  activeColor?: string;
};

export const SketchyButton = ({ 
  children, 
  className,
  fill = 'transparent',
  stroke = '#1a1a1a',
  activeColor = '#e5e7eb',
  type = 'button',
  ...props 
}: SketchyButtonProps) => {
  const { elementRef, size } = useElementSize<HTMLButtonElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }

    drawRoughRectangle(canvas, {
      x: 4,
      y: 4,
      width: size.width - 8,
      height: size.height - 8,
      fill: hovered ? activeColor : fill,
      fillStyle: 'hachure',
      hachureGap: 8,
      roughness: 1.2,
      stroke,
      strokeWidth: 2,
    });
  }, [activeColor, fill, hovered, size.height, size.width, stroke]);

  return (
    <button
      ref={elementRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative px-6 py-2 font-bold transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-blue disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      type={type}
      {...props}
    >
      <canvas 
        ref={canvasRef} 
        width={size.width} 
        height={size.height} 
        className="absolute top-0 left-0 pointer-events-none z-0"
      />
      <span className="relative z-10">{children}</span>
    </button>
  );
};
