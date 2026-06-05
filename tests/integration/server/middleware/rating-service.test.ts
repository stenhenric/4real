import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';

import { RatingEvent } from '../../../../server/models/RatingEvent.ts';
import {
  calculateRatingChange,
  RATING_SYSTEM,
  RatingService,
} from '../../../../server/services/rating.service.ts';
import { UserService } from '../../../../server/services/user.service.ts';

const PLAYER_1 = 'player-1';
const PLAYER_2 = 'player-2';

function calculate({
  player1Rating = RATING_SYSTEM.startingRating,
  player2Rating = RATING_SYSTEM.startingRating,
  player1RatedGames = 0,
  player2RatedGames = 0,
  outcome = 'player1_win',
  previousPairRatedMatches = 0,
}: {
  player1Rating?: number;
  player2Rating?: number;
  player1RatedGames?: number;
  player2RatedGames?: number;
  outcome?: 'player1_win' | 'player2_win' | 'draw' | 'no_contest';
  previousPairRatedMatches?: number;
} = {}) {
  return calculateRatingChange({
    player1: {
      id: PLAYER_1,
      rating: player1Rating,
      ratedGames: player1RatedGames,
    },
    player2: {
      id: PLAYER_2,
      rating: player2Rating,
      ratedGames: player2RatedGames,
    },
    outcome,
    previousPairRatedMatches,
  });
}

test('rating constants define fresh database defaults', () => {
  assert.equal(RATING_SYSTEM.startingRating, 300);
  assert.equal(RATING_SYSTEM.minimumRating, 0);
  assert.equal(RATING_SYSTEM.formulaVersion, 'fresh-db-elo-v1');
});

test('equal-rating win and loss use provisional Elo movement', () => {
  const result = calculate();

  assert.equal(result.status, 'applied');
  assert.equal(result.player1.before, 300);
  assert.equal(result.player1.delta, 20);
  assert.equal(result.player1.after, 320);
  assert.equal(result.player2.before, 300);
  assert.equal(result.player2.delta, -20);
  assert.equal(result.player2.after, 280);
  assert.equal(result.kFactor, 40);
});

test('equal-rating draw is applied without a fake win or loss', () => {
  const result = calculate({ outcome: 'draw' });

  assert.equal(result.status, 'applied');
  assert.equal(result.player1.delta, 0);
  assert.equal(result.player2.delta, 0);
  assert.equal(result.player1.after, 300);
  assert.equal(result.player2.after, 300);
});

test('upsets move more Elo than expected wins', () => {
  const favoriteWins = calculate({
    player1Rating: 600,
    player2Rating: 300,
    outcome: 'player1_win',
  });
  const underdogWins = calculate({
    player1Rating: 600,
    player2Rating: 300,
    outcome: 'player2_win',
  });

  assert.equal(favoriteWins.player1.delta, 6);
  assert.equal(favoriteWins.player2.delta, -6);
  assert.equal(underdogWins.player1.delta, -34);
  assert.equal(underdogWins.player2.delta, 34);
});

test('unequal-rating draws reward the lower-rated player and penalize the higher-rated player', () => {
  const result = calculate({
    player1Rating: 600,
    player2Rating: 300,
    outcome: 'draw',
  });

  assert.equal(result.player1.delta, -14);
  assert.equal(result.player2.delta, 14);
});

test('experienced players use a lower K factor than new players', () => {
  const newPlayerResult = calculate({
    player1RatedGames: 0,
    player2RatedGames: 0,
  });
  const experiencedResult = calculate({
    player1RatedGames: 35,
    player2RatedGames: 35,
  });

  assert.equal(newPlayerResult.kFactor, 40);
  assert.equal(experiencedResult.kFactor, 16);
  assert.equal(newPlayerResult.player1.delta, 20);
  assert.equal(experiencedResult.player1.delta, 8);
});

test('rating floor clamps loser deltas at the minimum rating', () => {
  const result = calculate({
    player1Rating: 5,
    player2Rating: 300,
    outcome: 'player2_win',
  });

  assert.equal(result.player1.after, 0);
  assert.equal(result.player1.delta, -5);
  assert.equal(result.player2.delta, 6);
});

test('no-contest outcomes are represented as skipped rating changes', () => {
  const result = calculate({ outcome: 'no_contest' });

  assert.equal(result.status, 'skipped');
  assert.equal(result.skipReason, 'no_contest');
  assert.equal(result.player1.delta, 0);
  assert.equal(result.player2.delta, 0);
});

test('repeat-pair abuse controls can skip automatic rating movement', () => {
  const result = calculate({ previousPairRatedMatches: 5 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.skipReason, 'repeat_pair_limit');
  assert.equal(result.repeatPairMultiplier, 0);
  assert.equal(result.player1.delta, 0);
  assert.equal(result.player2.delta, 0);
});

test('applyMatchRating records an audit event and updates player rating stats', async (t) => {
  const matchId = new mongoose.Types.ObjectId();
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const eventId = new mongoose.Types.ObjectId();
  const session = {} as mongoose.ClientSession;
  let capturedEvent: Record<string, any> | undefined;

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    elo: 300,
    stats: { wins: 0, losses: 0, draws: 0 },
  } as any));
  const previousPairMock = mock.method(RatingService, 'countPreviousPairRatedMatches', async () => 0);
  const createEventMock = mock.method(RatingEvent, 'create', async (documents: any[]) => {
    [capturedEvent] = documents;
    return [{ _id: eventId }] as any;
  });
  const updateStatsMock = mock.method(UserService, 'updateStatsAndElo', async (id: string) => ({ _id: id } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => previousPairMock.mock.restore());
  t.after(() => createEventMock.mock.restore());
  t.after(() => updateStatsMock.mock.restore());

  const result = await RatingService.applyMatchRating({
    matchId,
    roomId: 'rated-room',
    player1Id: player1Id.toString(),
    player2Id: player2Id.toString(),
    outcome: 'player1_win',
    settlementReason: 'winner',
    session,
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.ratingEventId, eventId.toString());
  assert.equal(result.player1.delta, 20);
  assert.equal(result.player2.delta, -20);
  assert.equal(capturedEvent?.matchId.toString(), matchId.toString());
  assert.equal(capturedEvent?.roomId, 'rated-room');
  assert.equal(capturedEvent?.outcome, 'player1_win');
  assert.equal(capturedEvent?.status, 'applied');
  assert.equal(capturedEvent?.formulaVersion, 'fresh-db-elo-v1');
  assert.equal(capturedEvent?.player1.before, 300);
  assert.equal(capturedEvent?.player1.delta, 20);
  assert.equal(capturedEvent?.player1.after, 320);
  assert.equal(capturedEvent?.player2.before, 300);
  assert.equal(capturedEvent?.player2.delta, -20);
  assert.equal(capturedEvent?.player2.after, 280);
  assert.equal(updateStatsMock.mock.callCount(), 2);
  assert.deepEqual(updateStatsMock.mock.calls.map((call) => [
    call.arguments[0],
    call.arguments[1],
    call.arguments[2],
  ]), [
    [player1Id.toString(), 20, 'win'],
    [player2Id.toString(), -20, 'loss'],
  ]);
});

test('applyMatchRating prevents duplicate rating for the same match', async (t) => {
  const player1Id = new mongoose.Types.ObjectId();
  const player2Id = new mongoose.Types.ObjectId();
  const session = {} as mongoose.ClientSession;

  const findUserMock = mock.method(UserService, 'findById', async (id: string) => ({
    _id: new mongoose.Types.ObjectId(id),
    elo: 300,
    stats: { wins: 0, losses: 0, draws: 0 },
  } as any));
  const previousPairMock = mock.method(RatingService, 'countPreviousPairRatedMatches', async () => 0);
  const createEventMock = mock.method(RatingEvent, 'create', async () => {
    throw { code: 11000 };
  });
  const updateStatsMock = mock.method(UserService, 'updateStatsAndElo', async () => ({ _id: player1Id } as any));

  t.after(() => findUserMock.mock.restore());
  t.after(() => previousPairMock.mock.restore());
  t.after(() => createEventMock.mock.restore());
  t.after(() => updateStatsMock.mock.restore());

  await assert.rejects(
    RatingService.applyMatchRating({
      matchId: new mongoose.Types.ObjectId(),
      roomId: 'duplicate-room',
      player1Id: player1Id.toString(),
      player2Id: player2Id.toString(),
      outcome: 'player1_win',
      settlementReason: 'winner',
      session,
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'MATCH_RATING_ALREADY_APPLIED');
      return true;
    },
  );

  assert.equal(updateStatsMock.mock.callCount(), 0);
});
