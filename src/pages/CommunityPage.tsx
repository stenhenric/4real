import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, LifeBuoy, MessageCircle, Send } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { getPublicConfig } from '../services/public-config.service';

type TelegramLinkStatus = 'loading' | 'ready' | 'error';

function CommunityLinkCard({
  title,
  description,
  href,
  icon,
  badge,
  status,
}: {
  title: string;
  description: string;
  href: string | null;
  icon: ReactNode;
  badge: string;
  status: TelegramLinkStatus;
}) {
  const unavailableLabel = status === 'loading'
    ? `Loading ${title}`
    : status === 'error'
      ? `${title} unavailable`
      : `${title} not configured`;

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

      {href ? (
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
      ) : (
        <div
          aria-disabled="true"
          className="sketchy-border mt-5 inline-flex w-full min-w-0 items-center justify-center gap-2 bg-black/10 px-5 py-3 text-sm font-bold text-black/55 shadow-sm sm:w-auto"
        >
          <Send size={16} />
          {unavailableLabel}
        </div>
      )}
    </article>
  );
}

export default function CommunityPage() {
  const [communityUrl, setCommunityUrl] = useState<string | null>(null);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus>('loading');

  useEffect(() => {
    const controller = new AbortController();

    void getPublicConfig(controller.signal)
      .then((config) => {
        if (controller.signal.aborted) {
          return;
        }

        setCommunityUrl(config.telegram.communityUrl);
        setSupportUrl(config.telegram.supportUrl);
        setTelegramStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTelegramStatus('error');
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

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
          status={telegramStatus}
          title="Telegram Community"
        />
        <CommunityLinkCard
          badge="Help desk"
          description="Use support for account questions, payment issues, withdrawal help, and issue reporting."
          href={supportUrl}
          icon={<LifeBuoy size={26} />}
          status={telegramStatus}
          title="Telegram Support"
        />
      </div>
    </div>
  );
}
