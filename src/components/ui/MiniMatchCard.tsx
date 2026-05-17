import { cn } from '../../utils/cn';
import type { MatchDTO } from '../../types/api';

const MINI_BOARD_SLOTS = Array.from({ length: 14 }, (_, index) => index);

function MiniBoardPreview({ match }: { match: MatchDTO }) {
  return (
    <div
      aria-hidden="true"
      className="grid aspect-[7/2] w-full max-w-[8.5rem] shrink-0 grid-cols-7 gap-1 border-2 border-black/10 bg-black/5 p-1 sm:max-w-[9.5rem]"
    >
      {MINI_BOARD_SLOTS.map((slot) => (
        <div
          key={slot}
          className={cn(
            'aspect-square rounded-full border border-ink-blue/50',
            match.moveHistory?.[slot] && (slot % 2 === 0 ? 'disc-red border-0' : 'disc-blue border-0'),
          )}
        />
      ))}
    </div>
  );
}

interface MiniMatchCardProps {
  match: MatchDTO;
  currentUserId?: string | undefined;
}

export function MiniMatchCard({ match, currentUserId }: MiniMatchCardProps) {
  const outcome =
    match.winnerId === currentUserId
      ? 'VICTORY'
      : match.winnerId === 'draw'
        ? 'DRAW'
        : 'DEFEAT';

  return (
    <article className="sketch-card grid gap-4 p-4 transition-colors hover:bg-black/5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-bold uppercase tracking-tighter sm:text-xl">
          <span className="max-w-full truncate">{match.p1Username}</span>
          <span className="text-sm opacity-25">VS</span>
          <span className="max-w-full truncate">{match.p2Username || 'GHOST'}</span>
        </p>
        <p className="mt-1 text-[10px] font-mono font-bold uppercase opacity-45">
          Outcome:{' '}
          <span className={outcome === 'VICTORY' ? 'text-success-text' : outcome === 'DRAW' ? 'text-warning-text' : 'text-danger-text'}>
            {outcome}
          </span>
        </p>
      </div>
      <MiniBoardPreview match={match} />
    </article>
  );
}
