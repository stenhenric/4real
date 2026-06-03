import type { ReactNode } from 'react';
import { ExternalLink, LifeBuoy, MessageCircle, Send } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';

const DEFAULT_COMMUNITY_URL = 'https://t.me/4realcommunity';
const DEFAULT_SUPPORT_URL = 'https://t.me/4realsupport';

function getTelegramUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && /^https:\/\/t\.me\/[A-Za-z0-9_/-]+$/.test(trimmed) ? trimmed : fallback;
}

const communityUrl = getTelegramUrl(import.meta.env.VITE_TELEGRAM_COMMUNITY_URL, DEFAULT_COMMUNITY_URL);
const supportUrl = getTelegramUrl(import.meta.env.VITE_TELEGRAM_SUPPORT_URL, DEFAULT_SUPPORT_URL);

function CommunityLinkCard({
  title,
  description,
  href,
  icon,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  badge: string;
}) {
  return (
    <article className="rough-border bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rough-border flex size-14 shrink-0 items-center justify-center bg-info-bg text-info-text">
          {icon}
        </div>
        <div className="min-w-0">
          <StatusBadge tone="info">{badge}</StatusBadge>
          <h2 className="mt-3 text-2xl font-semibold italic tracking-tight">{title}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-black/65">{description}</p>
        </div>
      </div>

      <a
        className="sketchy-border mt-5 inline-flex w-full min-w-0 items-center justify-center gap-2 bg-note-yellow px-5 py-3 text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-blue active:scale-95 sm:w-auto"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Send size={16} />
        Open {title}
        <ExternalLink size={16} />
      </a>
    </article>
  );
}

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <div className="inline-flex -rotate-1 items-center gap-2 bg-note-yellow px-3 py-1 text-xs font-bold uppercase tracking-widest">
          <MessageCircle size={16} />
          Telegram channels
        </div>
        <h1 className="mt-4 text-4xl font-bold italic tracking-tight sm:text-5xl">Community</h1>
        <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-black/65">
          Join the public conversation for announcements, discussions, updates, and account or payment help.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <CommunityLinkCard
          badge="Announcements"
          description="Follow product updates, game announcements, leaderboard chatter, and community discussion."
          href={communityUrl}
          icon={<MessageCircle size={26} />}
          title="Telegram Community"
        />
        <CommunityLinkCard
          badge="Help desk"
          description="Use support for account questions, payment issues, withdrawal help, and issue reporting."
          href={supportUrl}
          icon={<LifeBuoy size={26} />}
          title="Telegram Support"
        />
      </div>
    </div>
  );
}
