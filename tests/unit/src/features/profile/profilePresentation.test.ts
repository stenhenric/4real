import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateProfileStats,
  getProfileAchievements,
  getVisibleProfileMatches,
} from '../../../../../src/features/profile/profilePresentation.ts';
import type { MatchDTO, UserProfileDTO } from '../../../../../src/types/api.ts';

const profile: UserProfileDTO = {
  id: 'user-1',
  username: 'player-one',
  elo: 1100,
  stats: { wins: 0, losses: 0, draws: 0 },
  avatar: { preset: 'pencil-face-01', color: 'ink' },
};

function match(overrides: Partial<MatchDTO>): MatchDTO {
  return {
    _id: 'match-1',
    roomId: 'room-1',
    p1Username: 'player-one',
    p2Username: 'player-two',
    player1Id: 'user-1',
    player2Id: 'user-2',
    status: 'completed',
    winnerId: 'user-1',
    wager: '0.000000',
    isPrivate: false,
    moveHistory: [],
    settlementReason: 'winner',
    ...overrides,
  };
}

describe('profile presentation helpers', () => {
  it('calculates zero-safe profile stats', () => {
    assert.deepEqual(calculateProfileStats(profile), {
      totalMatches: 0,
      winRateLabel: '0%',
      recordLabel: '0-0-0',
    });
  });

  it('computes profile achievements from stats and visible history', () => {
    const achievements = getProfileAchievements({
      profile: {
        ...profile,
        stats: { wins: 5, losses: 1, draws: 1 },
      },
      history: [
        match({ _id: 'win-1', winnerId: 'user-1', wager: '2.000000', moveHistory: [{ userId: 'user-1', col: 0, row: 0 }] }),
        match({ _id: 'win-2', winnerId: 'user-1', moveHistory: [] }),
        match({ _id: 'draw-1', winnerId: 'draw', settlementReason: 'draw' }),
      ],
      userId: 'user-1',
    });

    const unlocked = new Set(achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id));
    assert.equal(achievements.length, 8);
    assert.equal(unlocked.has('first-strike'), true);
    assert.equal(unlocked.has('five-wins'), true);
    assert.equal(unlocked.has('paid-player'), true);
    assert.equal(unlocked.has('draw-artist'), true);
  });

  it('filters visible profile matches by outcome and wagered state', () => {
    const history = [
      match({ _id: 'win', winnerId: 'user-1', wager: '0.000000' }),
      match({ _id: 'loss', winnerId: 'user-2', wager: '0.000000' }),
      match({ _id: 'draw', winnerId: 'draw', settlementReason: 'draw', wager: '0.000000' }),
      match({ _id: 'cancelled', winnerId: 'draw', settlementReason: 'resigned', outcome: 'no_contest', wager: '0.000000' }),
      match({ _id: 'wagered', winnerId: 'user-1', wager: '1.000000' }),
    ];

    assert.deepEqual(getVisibleProfileMatches(history, 'user-1', 'wins').map((item) => item._id), ['win', 'wagered']);
    assert.deepEqual(getVisibleProfileMatches(history, 'user-1', 'losses').map((item) => item._id), ['loss']);
    assert.deepEqual(getVisibleProfileMatches(history, 'user-1', 'draws').map((item) => item._id), ['draw']);
    assert.deepEqual(getVisibleProfileMatches(history, 'user-1', 'wagered').map((item) => item._id), ['wagered']);
  });

  it('keeps no-contest out of draw filters and requires moves for clean-sheet wins', () => {
    const achievements = getProfileAchievements({
      profile: {
        ...profile,
        stats: { wins: 0, losses: 0, draws: 0 },
      },
      history: [
        match({ _id: 'cancelled', winnerId: 'draw', settlementReason: 'resigned', outcome: 'no_contest' }),
        match({ _id: 'empty-win', winnerId: 'user-1', moveHistory: [] }),
      ],
      userId: 'user-1',
    });

    const unlocked = new Set(achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id));
    assert.equal(unlocked.has('draw-artist'), false);
    assert.equal(unlocked.has('finisher'), true);
    assert.equal(unlocked.has('clean-sheet'), false);
  });
});
