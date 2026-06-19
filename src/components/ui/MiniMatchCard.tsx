import { cn } from '../../utils/cn';
import type { MatchDTO } from '../../types/api';
import { getProfileMatchOutcomePresentation } from '../../features/profile/profilePresentation';
import { buildMiniMatchBoardCells, getMiniMatchDiscClass } from './miniMatchBoard';

function MiniBoardPreview({ match }: { match: MatchDTO }) {
  const cells = buildMiniMatchBoardCells(match.moveHistory, match.player1Id, match.player2Id);

  return (
    <div
      aria-hidden="true"
      className="grid aspect-[7/6] w-full max-w-[8.5rem] shrink-0 grid-cols-7 gap-1 border-2 border-black/10 bg-black/5 p-1 sm:max-w-[9.5rem]"
    >
      {cells.map((cell) => (
        <div
          key={`${cell.row}-${cell.col}`}
          className={cn(
            'aspect-square rounded-full border border-ink-blue/50',
            getMiniMatchDiscClass(cell.owner),
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
  const outcome = getProfileMatchOutcomePresentation(match, currentUserId ?? '');
  const outcomeClass = outcome.tone === 'success'
    ? 'text-success-text'
    : outcome.tone === 'warning'
      ? 'text-warning-text'
      : 'text-danger-text';

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
          <span className={outcomeClass}>
            {outcome.label}
          </span>
        </p>
      </div>
      <MiniBoardPreview match={match} />
    </article>
  );
}
