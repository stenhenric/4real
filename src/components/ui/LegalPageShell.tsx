import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SketchyButton } from '../SketchyButton';
import { StatusBadge } from './StatusBadge';
import { cn } from '../../utils/cn';

export interface LegalSection {
  title: string;
  body: ReactNode;
  badge: string;
  icon?: LucideIcon;
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface LegalPageShellProps {
  title: string;
  eyebrow: string;
  summary: string;
  sections: LegalSection[];
}

export function LegalPageShell({ title, eyebrow, summary, sections }: LegalPageShellProps) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <SketchyButton
        className="mb-8 px-4 py-2 text-sm"
        onClick={() => navigate('/')}
        type="button"
        variant="secondary"
      >
        <ArrowLeft size={16} />
        4real home
      </SketchyButton>

      <article className="rough-border relative bg-white p-5 shadow-xl sm:p-8 lg:p-10">
        <div className="tape w-24 h-8 -top-3 left-1/2 -ml-12" />
        <header className="border-b-2 border-black/10 pb-6">
          <div className="inline-flex -rotate-1 items-center gap-2 bg-note-yellow px-3 py-1 text-xs font-bold uppercase tracking-widest">
            <FileText size={16} />
            {eyebrow}
          </div>
          <h1 className="mt-4 text-4xl font-display font-semibold italic tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-black/65">
            {summary}
          </p>
        </header>

        <div className="mt-6 grid gap-4">
          {sections.map((section) => {
            const Icon = section.icon ?? FileText;
            const tone = section.tone ?? 'info';

            return (
              <section
                key={section.title}
                className={cn(
                  'rough-border bg-paper-soft p-4 sm:p-5',
                  tone === 'danger' && 'border-danger-border bg-danger-bg',
                  tone === 'warning' && 'border-warning-border bg-warning-bg',
                  tone === 'success' && 'border-success-border bg-success-bg',
                  tone === 'info' && 'border-info-border bg-info-bg',
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="rough-border flex size-12 shrink-0 items-center justify-center bg-white text-ink-blue">
                    <Icon size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <StatusBadge tone={tone}>{section.badge}</StatusBadge>
                    <h2 className="mt-3 text-2xl font-display font-semibold italic tracking-tight text-ink-black">
                      {section.title}
                    </h2>
                    <div className="mt-2 text-base font-bold leading-7 text-ink-black/75">
                      {section.body}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}
