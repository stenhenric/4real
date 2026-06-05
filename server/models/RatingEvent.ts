import mongoose, { Document, Schema } from 'mongoose';

import type {
  MatchOutcome,
  RatingSkipReason,
  RatingStatus,
} from '../types/api.ts';

export interface IRatingEventPlayer {
  userId: mongoose.Types.ObjectId;
  before: number;
  delta: number;
  after: number;
  score: number;
  expectedScore: number;
}

export interface IRatingEvent extends Document {
  matchId: mongoose.Types.ObjectId;
  roomId: string;
  pairKey: string;
  player1Id: mongoose.Types.ObjectId;
  player2Id: mongoose.Types.ObjectId;
  player1: IRatingEventPlayer;
  player2: IRatingEventPlayer;
  outcome: MatchOutcome;
  settlementReason: string;
  status: RatingStatus;
  skipReason?: RatingSkipReason;
  formulaVersion: string;
  kFactor: number;
  repeatPairMultiplier: number;
  previousPairRatedMatches: number;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RatingEventPlayerSchema = new Schema<IRatingEventPlayer>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  before: { type: Number, required: true, min: 0 },
  delta: { type: Number, required: true },
  after: { type: Number, required: true, min: 0 },
  score: { type: Number, required: true },
  expectedScore: { type: Number, required: true },
}, {
  _id: false,
});

const RatingEventSchema = new Schema<IRatingEvent>({
  matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
  roomId: { type: String, required: true },
  pairKey: { type: String, required: true },
  player1Id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  player2Id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  player1: { type: RatingEventPlayerSchema, required: true },
  player2: { type: RatingEventPlayerSchema, required: true },
  outcome: {
    type: String,
    enum: ['player1_win', 'player2_win', 'draw', 'no_contest'],
    required: true,
  },
  settlementReason: { type: String, required: true },
  status: {
    type: String,
    enum: ['applied', 'skipped', 'pending', 'reversed'],
    required: true,
  },
  skipReason: {
    type: String,
    enum: [
      'waiting_expired',
      'waiting_cancelled',
      'no_opponent',
      'invalid_winner',
      'no_contest',
      'suspicious',
      'disputed',
      'refunded',
      'repeat_pair_limit',
      'rating_not_required',
    ],
  },
  formulaVersion: { type: String, required: true },
  kFactor: { type: Number, required: true, min: 0 },
  repeatPairMultiplier: { type: Number, required: true, min: 0, max: 1 },
  previousPairRatedMatches: { type: Number, required: true, min: 0 },
  appliedAt: { type: Date },
}, {
  timestamps: true,
});

RatingEventSchema.index(
  { matchId: 1 },
  { unique: true, name: 'rating_events_match_unique' },
);
RatingEventSchema.index(
  { pairKey: 1, status: 1, createdAt: -1 },
  { name: 'rating_events_pair_status_created_at' },
);
RatingEventSchema.index(
  { player1Id: 1, createdAt: -1 },
  { name: 'rating_events_player1_created_at' },
);
RatingEventSchema.index(
  { player2Id: 1, createdAt: -1 },
  { name: 'rating_events_player2_created_at' },
);

export const RatingEvent = mongoose.model<IRatingEvent>('RatingEvent', RatingEventSchema);
