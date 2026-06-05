import type { MatchDTO, UserProfileDTO } from '../../types/api';

export type ProfileMatchFilter = 'all' | 'wins' | 'losses' | 'draws' | 'wagered';

export interface ProfileStatSummary {
  totalMatches: number;
  winRateLabel: string;
  recordLabel: string;
}

export interface ProfileAchievement {
  id: string;
  label: string;
  requirement: string;
  unlocked: boolean;
}

export const PROFILE_MATCH_FILTERS: Array<{ id: ProfileMatchFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'wins', label: 'Wins' },
  { id: 'losses', label: 'Losses' },
  { id: 'draws', label: 'Draws' },
  { id: 'wagered', label: 'Wagered' },
];

function getTotalMatches(profile: UserProfileDTO): number {
  return (profile.stats?.wins ?? 0) + (profile.stats?.losses ?? 0) + (profile.stats?.draws ?? 0);
}

function isDraw(match: MatchDTO): boolean {
  return match.winnerId === 'draw' || match.settlementReason === 'draw';
}

function isWin(match: MatchDTO, userId: string): boolean {
  return match.winnerId === userId;
}

function isLoss(match: MatchDTO, userId: string): boolean {
  return match.status === 'completed' && Boolean(match.winnerId) && !isDraw(match) && match.winnerId !== userId;
}

function isWagered(match: MatchDTO): boolean {
  return Number.parseFloat(match.wager) > 0;
}

export function calculateProfileStats(profile: UserProfileDTO): ProfileStatSummary {
  const totalMatches = getTotalMatches(profile);
  const wins = profile.stats?.wins ?? 0;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return {
    totalMatches,
    winRateLabel: `${winRate}%`,
    recordLabel: `${wins}-${profile.stats?.losses ?? 0}-${profile.stats?.draws ?? 0}`,
  };
}

export function getVisibleProfileMatches(
  history: MatchDTO[],
  userId: string,
  filter: ProfileMatchFilter,
): MatchDTO[] {
  if (filter === 'all') {
    return history;
  }

  return history.filter((match) => {
    if (filter === 'wins') return isWin(match, userId);
    if (filter === 'losses') return isLoss(match, userId);
    if (filter === 'draws') return isDraw(match);
    return isWagered(match);
  });
}

function hasRecentWinStreak(history: MatchDTO[], userId: string): boolean {
  const completed = history.filter((match) => match.status === 'completed').slice(0, 3);
  return completed.length >= 3 && completed.every((match) => isWin(match, userId));
}

function hasCleanSheet(history: MatchDTO[], userId: string): boolean {
  return history.some((match) => (
    isWin(match, userId)
    && match.status === 'completed'
    && match.moveHistory.every((move) => move.userId === userId)
  ));
}

export function getProfileAchievements(params: {
  profile: UserProfileDTO;
  history: MatchDTO[];
  userId: string;
}): ProfileAchievement[] {
  const { profile, history, userId } = params;
  const totalMatches = getTotalMatches(profile);

  return [
    {
      id: 'first-strike',
      label: 'First Strike',
      requirement: 'Win 1 match',
      unlocked: (profile.stats?.wins ?? 0) >= 1,
    },
    {
      id: 'five-wins',
      label: 'Five Wins',
      requirement: 'Win 5 matches',
      unlocked: (profile.stats?.wins ?? 0) >= 5,
    },
    {
      id: 'battle-tested',
      label: 'Battle Tested',
      requirement: 'Play 10 matches',
      unlocked: totalMatches >= 10,
    },
    {
      id: 'draw-artist',
      label: 'Draw Artist',
      requirement: 'Record 1 draw',
      unlocked: (profile.stats?.draws ?? 0) >= 1,
    },
    {
      id: 'hot-hand',
      label: 'Hot Hand',
      requirement: 'Win 3 recent matches',
      unlocked: hasRecentWinStreak(history, userId),
    },
    {
      id: 'paid-player',
      label: 'Paid Player',
      requirement: 'Play a wagered match',
      unlocked: history.some(isWagered),
    },
    {
      id: 'finisher',
      label: 'Finisher',
      requirement: 'Finish a decided match',
      unlocked: history.some((match) => match.status === 'completed' && Boolean(match.winnerId) && !isDraw(match)),
    },
    {
      id: 'clean-sheet',
      label: 'Clean Sheet',
      requirement: 'Win before a rival move lands',
      unlocked: hasCleanSheet(history, userId),
    },
  ];
}
