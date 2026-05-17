import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className }: EmptyStateProps) {
  return (
    <div className={cn('rough-border border-dashed bg-paper-soft/80 px-5 py-10 text-center', className)}>
      <p className="text-sm font-bold uppercase tracking-widest opacity-35 italic">{children}</p>
    </div>
  );
}
