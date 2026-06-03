import type * as React from 'react';
import { cn } from '../../utils/cn';
import { AuthInput } from './components/AuthInput';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  aside,
  footer,
  maxWidthClass = 'max-w-lg',
}: AuthShellProps) {
  return (
    <div className={cn('mx-auto w-full', maxWidthClass)}>
      <div className="rough-border bg-white p-5 sm:p-8 relative shadow-xl">
        {/* Tape decoration matching app pattern */}
        <div className="tape w-20 h-6 -top-2 left-1/2 -ml-10 rotate-1" />

        <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50 mb-4">
          {eyebrow}
        </p>

        <div className="relative inline-block mb-2">
          <h1 className="font-display text-4xl font-semibold italic tracking-tighter">
            {title}
          </h1>
          <div className="highlighter w-full bottom-1 left-0 h-4 scale-x-105" />
        </div>

        <p className="mt-4 text-sm font-bold opacity-60 leading-6">{description}</p>
        <div aria-hidden="true" className="mt-5 h-2 w-full rough-border border-info-border bg-info-bg" />

        <div className="mt-8">{children}</div>

        {footer ? (
          <div className="mt-8 border-t-2 border-black/10 pt-6">{footer}</div>
        ) : null}
      </div>

      {aside ? <div className="mt-6 space-y-6">{aside}</div> : null}
    </div>
  );
}

interface AuthFieldProps extends React.ComponentProps<'input'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export function AuthField({ label, hint, error, className, id, ...props }: AuthFieldProps) {
  const fieldId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <AuthInput
      {...props}
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      inputClassName={className}
    />
  );
}

interface AuthTextareaProps extends React.ComponentProps<'textarea'> {
  label: string;
  hint?: string | undefined;
}

export function AuthTextarea({ label, hint, className, id, ...props }: AuthTextareaProps) {
  const fieldId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <label className="block" htmlFor={fieldId}>
      <span className="font-mono font-bold text-[10px] uppercase tracking-widest opacity-60">{label}</span>
      <textarea
        {...props}
        id={fieldId}
        className={cn(
          'mt-2 min-h-28 w-full bg-transparent border-b-4 border-black font-bold text-base outline-none p-2 focus:bg-white/50 transition-colors placeholder:opacity-30',
          className,
        )}
      />
      {hint ? <span className="mt-1 block text-xs font-bold opacity-40">{hint}</span> : null}
    </label>
  );
}

export function AuthNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'border-l-4 px-4 py-3 text-sm font-bold leading-6',
        tone === 'info'    && 'border-info-border bg-info-bg text-info-text',
        tone === 'success' && 'border-success-border bg-success-bg text-success-text',
        tone === 'warning' && 'border-warning-border bg-warning-bg text-warning-text',
        tone === 'danger'  && 'border-danger-border bg-danger-bg text-danger-text',
      )}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-black/10" />
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</span>
      <div className="h-px flex-1 bg-black/10" />
    </div>
  );
}
