import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SketchCardProps {
  children: ReactNode;
  className?: string;
  tone?: 'paper' | 'note' | 'soft' | 'danger';
}

const toneClasses = {
  paper: 'bg-white',
  note: 'bg-note-yellow',
  soft: 'bg-paper-soft',
  danger: 'bg-danger-bg border-danger-border',
};

export function SketchCard({ children, className, tone = 'paper' }: SketchCardProps) {
  return (
    <div className={cn('rough-border p-5 shadow-lg', toneClasses[tone], className)}>
      {children}
    </div>
  );
}
