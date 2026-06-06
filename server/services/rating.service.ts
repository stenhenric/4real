import mongoose from 'mongoose';

import { RatingEvent } from '../models/RatingEvent.ts';
import type { IRatingEvent } from '../models/RatingEvent.ts';
import type { IUser } from '../models/User.ts';
import type {
  MatchOutcome,
  MatchRatingResultDTO,
  RatingSkipReason,
  RatingStatus,
} from '../types/api.ts';
import { conflict, internalServerError } from '../utils/http-error.ts';
import { UserService } from './user.service.ts';
export { RATING_SYSTEM } from '../../shared/rating.ts';
import { RATING_SYSTEM } from '../../shared/rating.ts';

export interface RatingPlayerInput {
  id: string;
  rating: number;
  ratedGames: number;
}

export interface CalculateRatingChangeInput {
  player1: RatingPlayerInput;
  player2: RatingPlayerInput;
  outcome: MatchOutcome;
  previousPairRatedMatches: number;
}

export interface RatingPlayerCalculation {
  id: string;
  before: number;
  delta: number;
  after: number;
  score: number;
  expectedScore: number;
}

export interface RatingCalculation {
  status: RatingStatus;
  skipReason?: RatingSkipReason;
  formulaVersion: string;
  outcome: MatchOutcome;
  player1: RatingPlayerCalculation;
  player2: RatingPlayerCalculation;
  kFactor: number;
  repeatPairMultiplier: number;
  previousPairRatedMatches: number;
}

export interface ApplyMatchRatingInput {
  matchId: mongoose.Types.ObjectId | string;
  roomId: string;
  player1Id: string;
  player2Id: string;
  outcome: MatchOutcome;
  settlementReason: string;
  session: mongoose.ClientSession;
}

function getRatedGames(user: Pick<IUser, 'stats'>): number {
  return Math.max(0,
    Number(user.stats?.wins ?? 0)
    + Number(user.stats?.losses ?? 0)
    + Number(user.stats?.draws ?? 0),
  );
}

function getKFactor(player: RatingPlayerInput): number {
  if (player.ratedGames < RATING_SYSTEM.provisionalGames) {
    return RATING_SYSTEM.provisionalK;
  }

  if (player.ratedGames >= RATING_SYSTEM.experiencedGames || player.rating >= 1000) {
    return RATING_SYSTEM.experiencedK;
  }

  return RATING_SYSTEM.activeK;
}

function getRepeatPairMultiplier(previousPairRatedMatches: number): number {
  if (previousPairRatedMatches < RATING_SYSTEM.repeatPairFullWeightLimit) {
    return 1;
  }

  if (previousPairRatedMatches < RATING_SYSTEM.repeatPairHalfWeightLimit) {
    return 0.5;
  }

  return 0;
}

function getScores(outcome: MatchOutcome): { player1: number; player2: number } {
  if (outcome === 'player1_win') {
    return { player1: 1, player2: 0 };
  }

  if (outcome === 'player2_win') {
    return { player1: 0, player2: 1 };
  }

  if (outcome === 'draw') {
    return { player1: 0.5, player2: 0.5 };
  }

  return { player1: 0, player2: 0 };
}

function getExpectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

function applyMinimumRatingFloor(before: number, rawDelta: number): { delta: number; after: number } {
  const after = Math.max(RATING_SYSTEM.minimumRating, before + rawDelta);
  return {
    delta: after - before,
    after,
  };
}

function buildPlayerCalculation({
  player,
  score,
  expectedScore,
  kFactor,
  repeatPairMultiplier,
}: {
  player: RatingPlayerInput;
  score: number;
  expectedScore: number;
  kFactor: number;
  repeatPairMultiplier: number;
}): RatingPlayerCalculation {
  const rawDelta = Math.round(kFactor * repeatPairMultiplier * (score - expectedScore));
  const { delta, after } = applyMinimumRatingFloor(player.rating, rawDelta);

  return {
    id: player.id,
    before: player.rating,
    delta,
    after,
    score,
    expectedScore,
  };
}

export function buildRatingPairKey(player1Id: string, player2Id: string): string {
  return [player1Id, player2Id].sort().join(':');
}

export function calculateRatingChange(input: CalculateRatingChangeInput): RatingCalculation {
  const player1ExpectedScore = getExpectedScore(input.player1.rating, input.player2.rating);
  const player2ExpectedScore = getExpectedScore(input.player2.rating, input.player1.rating);
  const baseKFactor = Math.round((getKFactor(input.player1) + getKFactor(input.player2)) / 2);
  const repeatPairMultiplier = getRepeatPairMultiplier(input.previousPairRatedMatches);
  const scores = getScores(input.outcome);
  const skippedForNoContest = input.outcome === 'no_contest';
  const skippedForRepeatPair = !skippedForNoContest && repeatPairMultiplier === 0;
  const effectiveMultiplier = skippedForNoContest || skippedForRepeatPair ? 0 : repeatPairMultiplier;

  return {
    status: skippedForNoContest || skippedForRepeatPair ? 'skipped' : 'applied',
    ...(skippedForNoContest ? { skipReason: 'no_contest' as const } : {}),
    ...(skippedForRepeatPair ? { skipReason: 'repeat_pair_limit' as const } : {}),
    formulaVersion: RATING_SYSTEM.formulaVersion,
    outcome: input.outcome,
    player1: buildPlayerCalculation({
      player: input.player1,
      score: scores.player1,
      expectedScore: player1ExpectedScore,
      kFactor: baseKFactor,
      repeatPairMultiplier: effectiveMultiplier,
    }),
    player2: buildPlayerCalculation({
      player: input.player2,
      score: scores.player2,
      expectedScore: player2ExpectedScore,
      kFactor: baseKFactor,
      repeatPairMultiplier: effectiveMultiplier,
    }),
    kFactor: baseKFactor,
    repeatPairMultiplier: effectiveMultiplier,
    previousPairRatedMatches: input.previousPairRatedMatches,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 11000,
  );
}

function toObjectId(id: mongoose.Types.ObjectId | string): mongoose.Types.ObjectId {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
}

function getStatsResult(outcome: MatchOutcome, player: 'player1' | 'player2'): 'win' | 'loss' | 'draw' | null {
  if (outcome === 'draw') {
    return 'draw';
  }

  if (outcome === 'player1_win') {
    return player === 'player1' ? 'win' : 'loss';
  }

  if (outcome === 'player2_win') {
    return player === 'player2' ? 'win' : 'loss';
  }

  return null;
}

export function serializeRatingCalculation(
  calculation: RatingCalculation,
  ratingEventId?: string,
): MatchRatingResultDTO {
  return {
    status: calculation.status,
    outcome: calculation.outcome,
    formulaVersion: calculation.formulaVersion,
    player1: {
      userId: calculation.player1.id,
      before: calculation.player1.before,
      delta: calculation.player1.delta,
      after: calculation.player1.after,
    },
    player2: {
      userId: calculation.player2.id,
      before: calculation.player2.before,
      delta: calculation.player2.delta,
      after: calculation.player2.after,
    },
    ...(ratingEventId ? { ratingEventId } : {}),
    ...(calculation.skipReason ? { skipReason: calculation.skipReason } : {}),
    kFactor: calculation.kFactor,
    repeatPairMultiplier: calculation.repeatPairMultiplier,
    previousPairRatedMatches: calculation.previousPairRatedMatches,
  };
}

function serializeRatingEvent(event: IRatingEvent): MatchRatingResultDTO {
  return {
    status: event.status,
    outcome: event.outcome,
    formulaVersion: event.formulaVersion,
    player1: {
      userId: event.player1.userId.toString(),
      before: event.player1.before,
      delta: event.player1.delta,
      after: event.player1.after,
    },
    player2: {
      userId: event.player2.userId.toString(),
      before: event.player2.before,
      delta: event.player2.delta,
      after: event.player2.after,
    },
    ratingEventId: event._id.toString(),
    ...(event.skipReason ? { skipReason: event.skipReason } : {}),
    kFactor: event.kFactor,
    repeatPairMultiplier: event.repeatPairMultiplier,
    previousPairRatedMatches: event.previousPairRatedMatches,
  };
}

export class RatingService {
  static async countPreviousPairRatedMatches({
    player1Id,
    player2Id,
    session,
  }: {
    player1Id: string;
    player2Id: string;
    session?: mongoose.ClientSession;
  }): Promise<number> {
    const since = new Date(Date.now() - RATING_SYSTEM.repeatPairWindowMs);
    const query = RatingEvent.countDocuments({
      pairKey: buildRatingPairKey(player1Id, player2Id),
      status: 'applied',
      createdAt: { $gte: since },
    });

    return session ? query.session(session) : query;
  }

  static async getMatchRatingResult(
    matchId: mongoose.Types.ObjectId | string,
    session?: mongoose.ClientSession,
  ): Promise<MatchRatingResultDTO | null> {
    const query = RatingEvent.findOne({ matchId: toObjectId(matchId) });
    const event = await (session ? query.session(session) : query);
    return event ? serializeRatingEvent(event) : null;
  }

  static async applyMatchRating(input: ApplyMatchRatingInput): Promise<MatchRatingResultDTO> {
    const player1 = await UserService.findById(input.player1Id, input.session);
    const player2 = await UserService.findById(input.player2Id, input.session);

    if (!player1 || !player2) {
      throw conflict('Match participant could not be rated', 'MATCH_PARTICIPANT_NOT_FOUND');
    }

    const previousPairRatedMatches = await this.countPreviousPairRatedMatches({
      player1Id: input.player1Id,
      player2Id: input.player2Id,
      session: input.session,
    });
    const calculation = calculateRatingChange({
      player1: {
        id: input.player1Id,
        rating: player1.elo,
        ratedGames: getRatedGames(player1),
      },
      player2: {
        id: input.player2Id,
        rating: player2.elo,
        ratedGames: getRatedGames(player2),
      },
      outcome: input.outcome,
      previousPairRatedMatches,
    });

    const now = new Date();
    const eventDocument = {
      matchId: toObjectId(input.matchId),
      roomId: input.roomId,
      pairKey: buildRatingPairKey(input.player1Id, input.player2Id),
      player1Id: toObjectId(input.player1Id),
      player2Id: toObjectId(input.player2Id),
      player1: {
        userId: toObjectId(input.player1Id),
        before: calculation.player1.before,
        delta: calculation.player1.delta,
        after: calculation.player1.after,
        score: calculation.player1.score,
        expectedScore: calculation.player1.expectedScore,
      },
      player2: {
        userId: toObjectId(input.player2Id),
        before: calculation.player2.before,
        delta: calculation.player2.delta,
        after: calculation.player2.after,
        score: calculation.player2.score,
        expectedScore: calculation.player2.expectedScore,
      },
      outcome: calculation.outcome,
      settlementReason: input.settlementReason,
      status: calculation.status,
      ...(calculation.skipReason ? { skipReason: calculation.skipReason } : {}),
      formulaVersion: calculation.formulaVersion,
      kFactor: calculation.kFactor,
      repeatPairMultiplier: calculation.repeatPairMultiplier,
      previousPairRatedMatches,
      ...(calculation.status === 'applied' ? { appliedAt: now } : {}),
    };

    let event: IRatingEvent | undefined;
    try {
      const createdEvents = await RatingEvent.create([eventDocument], { session: input.session });
      event = createdEvents[0];
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw conflict('Rating was already applied for this match', 'MATCH_RATING_ALREADY_APPLIED');
      }

      throw error;
    }

    if (!event) {
      throw internalServerError('Rating event could not be created', 'RATING_EVENT_CREATE_FAILED');
    }

    const player1Result = getStatsResult(input.outcome, 'player1');
    const player2Result = getStatsResult(input.outcome, 'player2');
    if (player1Result && player2Result) {
      const updatedPlayer1 = await UserService.updateStatsAndElo(
        input.player1Id,
        calculation.player1.delta,
        player1Result,
        input.session,
      );
      const updatedPlayer2 = await UserService.updateStatsAndElo(
        input.player2Id,
        calculation.player2.delta,
        player2Result,
        input.session,
      );

      if (!updatedPlayer1 || !updatedPlayer2) {
        throw internalServerError('Rated match participants could not be updated', 'RATING_USER_UPDATE_FAILED');
      }
    }

    return serializeRatingCalculation(calculation, event._id.toString());
  }
}
