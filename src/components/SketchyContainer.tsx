import React, { useEffect, useRef, useState } from 'react';
import rough from 'roughjs';
import { cn } from '../lib/utils';

interface SketchyContainerProps {
  children: React.ReactNode;
  className?: string;
  fill?: string;
  fillStyle?: 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed';
  stroke?: string;
  strokeWidth?: number;
  roughness?: number;
}

export const SketchyContainer: React.FC<SketchyContainerProps> = ({ 
  children, 
  className,
  fill = 'transparent',
  fillStyle = 'hachure',
  stroke = '#1a1a1a',
  strokeWidth = 2,
  roughness = 1.5
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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
        rc.rectangle(5, 5, dimensions.width - 10, dimensions.height - 10, {
          stroke,
          strokeWidth,
          roughness,
          fill,
          fillStyle,
          fillWeight: 1,
          hachureGap: 6
        });
      }
    }
  }, [dimensions, stroke, strokeWidth, roughness, fill, fillStyle]);

  return (
    <div ref={containerRef} className={cn("relative p-4", className)}>
      <canvas 
        ref={canvasRef} 
        width={dimensions.width} 
        height={dimensions.height} 
        className="absolute top-0 left-0 pointer-events-none z-0"
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
