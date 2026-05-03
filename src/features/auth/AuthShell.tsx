import type * as React from 'react';
import { LockKeyhole, ShieldCheck, Smartphone, TimerReset } from 'lucide-react';
import { SketchyContainer } from '../../components/SketchyContainer';
import { cn } from '../../utils/cn';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
}

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Protected sessions',
    body: 'Short-lived access cookies, rotated refresh tokens, and device visibility.',
  },
  {
    icon: Smartphone,
    title: 'Step-up verification',
    body: 'MFA is required before withdrawals, merchant operations, and session revocation.',
  },
  {
    icon: LockKeyhole,
    title: 'Verified accounts',
    body: 'Email verification gates account activation and privileged recovery flows.',
  },
  {
    icon: TimerReset,
    title: 'Recovery controls',
    body: 'Single-use reset links, recovery codes, and suspicious sign-in review.',
  },
] as const;

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  aside,
  footer,
}: AuthShellProps) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] xl:items-start">
        <SketchyContainer className="bg-white/95 p-6 shadow-2xl sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/50">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-ink-black sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-black/70">{description}</p>

          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-black/10 pt-6">{footer}</div> : null}
        </SketchyContainer>

        <div className="space-y-6">
          {aside ?? <DefaultAuthAside />}
        </div>
      </div>
    </div>
  );
}

function DefaultAuthAside() {
  return (
    <>
      <SketchyContainer className="bg-white/90 p-6 shadow-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/50">
          Trust Surface
        </p>
        <div className="mt-5 space-y-4">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="rounded-[28px] border border-black/10 bg-black/[0.03] p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-ink-blue/10 p-2 text-ink-blue">
                  <item.icon size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-black">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-black/65">{item.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SketchyContainer>

      <SketchyContainer className="bg-[#F7F4EC] p-6 shadow-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/50">
          What Changes
        </p>
        <div className="mt-5 space-y-4">
          <div className="rounded-[28px] border border-black/10 bg-white/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Entry</p>
            <p className="mt-2 text-lg font-bold">Email-first sign-in with Google and magic links.</p>
          </div>
          <div className="rounded-[28px] border border-black/10 bg-white/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Account State</p>
            <p className="mt-2 text-lg font-bold">Verification and public username completion before play.</p>
          </div>
          <div className="rounded-[28px] border border-black/10 bg-white/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Session Control</p>
            <p className="mt-2 text-lg font-bold">Per-device sessions, rotation, and self-serve revoke flows.</p>
          </div>
        </div>
      </SketchyContainer>
    </>
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
    <label className="block" htmlFor={fieldId}>
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/50">{label}</span>
      <input
        {...props}
        id={fieldId}
        className={cn(
          'mt-2 w-full rounded-[26px] border border-black/12 bg-[#FCFBF7] px-4 py-3 text-base font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-colors placeholder:text-black/35 focus:border-ink-blue',
          error && 'border-ink-red',
          className,
        )}
      />
      {hint ? <span className="mt-2 block text-sm text-black/55">{hint}</span> : null}
      {error ? <span className="mt-2 block text-sm font-semibold text-ink-red">{error}</span> : null}
    </label>
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
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/50">{label}</span>
      <textarea
        {...props}
        id={fieldId}
        className={cn(
          'mt-2 min-h-28 w-full rounded-[26px] border border-black/12 bg-[#FCFBF7] px-4 py-3 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-colors placeholder:text-black/35 focus:border-ink-blue',
          className,
        )}
      />
      {hint ? <span className="mt-2 block text-sm text-black/55">{hint}</span> : null}
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
        'rounded-[24px] border px-4 py-3 text-sm leading-6',
        tone === 'info' && 'border-blue-200 bg-blue-50 text-ink-blue',
        tone === 'success' && 'border-green-200 bg-green-50 text-green-800',
        tone === 'warning' && 'border-yellow-200 bg-yellow-50 text-yellow-900',
        tone === 'danger' && 'border-red-200 bg-red-50 text-ink-red',
      )}
    >
      {children}
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-black/10" />
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/40">{label}</span>
      <div className="h-px flex-1 bg-black/10" />
    </div>
  );
}
