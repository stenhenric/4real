import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  success: 'border-success-border bg-success-bg text-success-text',
  warning: 'border-warning-border bg-warning-bg text-warning-text',
  danger: 'border-danger-border bg-danger-bg text-danger-text',
  info: 'border-info-border bg-info-bg text-info-text',
  neutral: 'border-black/20 bg-white text-ink-black/70',
};

interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ children, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border px-3 py-1 text-xs font-bold uppercase leading-none',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusToneFromStatus(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (['done', 'completed', 'confirmed', 'success', 'stable', 'credited'].includes(normalized)) {
    return 'success';
  }

  if (['pending', 'queued', 'processing', 'sent', 'open', 'warning', 'medium'].includes(normalized)) {
    return 'warning';
  }

  if (['failed', 'rejected', 'dismissed', 'critical', 'high', 'error', 'stuck'].includes(normalized)) {
    return 'danger';
  }

  if (['info', 'informational', 'low'].includes(normalized)) {
    return 'info';
  }

  return 'neutral';
}
