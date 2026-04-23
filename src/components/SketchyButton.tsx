import React, { useEffect, useRef, useState } from 'react';
import rough from 'roughjs';
import { cn } from '../lib/utils';

interface SketchyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  fill?: string;
  stroke?: string;
  activeColor?: string;
}

export const SketchyButton: React.FC<SketchyButtonProps> = ({ 
  children, 
  className,
  fill = 'transparent',
  stroke = '#1a1a1a',
  activeColor = '#e5e7eb',
  ...props 
}) => {
  const containerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  useEffect(() => {
    if (canvasRef.current && dimensions.width > 0 && dimensions.height > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rc = rough.canvas(canvas);
        rc.rectangle(4, 4, dimensions.width - 8, dimensions.height - 8, {
          stroke,
          strokeWidth: 2,
          roughness: 1.2,
          fill: hovered ? activeColor : fill,
          fillStyle: 'hachure',
          hachureGap: 8
        });
      }
    }
  }, [dimensions, hovered, fill, stroke, activeColor]);

  return (
    <button
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative px-6 py-2 font-bold transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-blue disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <canvas 
        ref={canvasRef} 
        width={dimensions.width} 
        height={dimensions.height} 
        className="absolute top-0 left-0 pointer-events-none z-0"
      />
      <span className="relative z-10">{children}</span>
    </button>
  );
};
