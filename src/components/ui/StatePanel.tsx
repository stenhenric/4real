import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import { cn } from '../../utils/cn';

type StateTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<StateTone, {
  panel: string;
  icon: string;
  eyebrow: string;
}> = {
  neutral: {
    panel: 'border-black/20 bg-paper-soft',
    icon: 'border-black/20 bg-white text-ink-black/70',
    eyebrow: 'text-ink-black/55',
  },
  info: {
    panel: 'border-info-border bg-info-bg text-info-text',
    icon: 'border-info-border bg-white text-info-text',
    eyebrow: 'text-info-text/70',
  },
  success: {
    panel: 'border-success-border bg-success-bg text-success-text',
    icon: 'border-success-border bg-white text-success-text',
    eyebrow: 'text-success-text/70',
  },
  warning: {
    panel: 'border-warning-border bg-warning-bg text-warning-text',
    icon: 'border-warning-border bg-white text-warning-text',
    eyebrow: 'text-warning-text/75',
  },
  danger: {
    panel: 'border-danger-border bg-danger-bg text-danger-text',
    icon: 'border-danger-border bg-white text-danger-text',
    eyebrow: 'text-danger-text/75',
  },
};

interface StatePanelProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  tone?: StateTone;
}

export function StatePanel({
  title,
  children,
  actions,
  className,
  eyebrow,
  icon: Icon = Info,
  iconClassName,
  tone = 'neutral',
}: StatePanelProps) {
  const classes = toneClasses[tone];

  return (
    <section className={cn('mx-auto flex min-h-[45vh] max-w-xl items-center justify-center px-4 py-10', className)}>
      <div className={cn('rough-border w-full p-6 text-center shadow-lg sm:p-8', classes.panel)}>
        <div className={cn('rough-border mx-auto flex size-16 items-center justify-center', classes.icon)}>
          <Icon className={iconClassName} size={30} />
        </div>
        {eyebrow ? (
          <p className={cn('mt-5 text-xs font-bold uppercase tracking-[0.22em]', classes.eyebrow)}>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-3 text-3xl font-semibold italic tracking-tight text-ink-black sm:text-4xl">
          {title}
        </h1>
        {children ? (
          <div className="mx-auto mt-3 max-w-md text-sm font-bold leading-6 text-ink-black/65">
            {children}
          </div>
        ) : null}
        {actions ? (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
