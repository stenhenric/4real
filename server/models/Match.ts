import mongoose, { Document, Schema } from 'mongoose';

import type { MatchOutcome, MatchRatingResultDTO } from '../types/api.ts';

export interface IMatch extends Document {
  roomId: string;
  player1Id: mongoose.Types.ObjectId;
  player2Id?: mongoose.Types.ObjectId;
  p1Username: string;
  p2Username?: string;
  status: 'waiting' | 'active' | 'completed';
  winnerId?: string; // 'draw', player1Id, or player2Id
  settlementReason?: 'winner' | 'draw' | 'waiting_expired' | 'active_expired' | 'resigned';
  outcome?: MatchOutcome;
  ratingResult?: MatchRatingResultDTO;
  wager: string;
  isPrivate: boolean;
  inviteTokenHash?: string;
  moveHistory: { userId: string; col: number; row: number }[];
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MatchSchema: Schema = new Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  player1Id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  player2Id: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  p1Username: { type: String, required: true },
  p2Username: { type: String },
  status: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting', index: true },
  winnerId: { type: String },
  settlementReason: {
    type: String,
    enum: ['winner', 'draw', 'waiting_expired', 'active_expired', 'resigned'],
  },
  outcome: {
    type: String,
    enum: ['player1_win', 'player2_win', 'draw', 'no_contest'],
  },
  ratingResult: {
    status: {
      type: String,
      enum: ['applied', 'skipped', 'pending', 'reversed'],
    },
    outcome: {
      type: String,
      enum: ['player1_win', 'player2_win', 'draw', 'no_contest'],
    },
    formulaVersion: { type: String },
    player1: {
      userId: { type: String },
      before: { type: Number },
      delta: { type: Number },
      after: { type: Number },
    },
    player2: {
      userId: { type: String },
      before: { type: Number },
      delta: { type: Number },
      after: { type: Number },
    },
    ratingEventId: { type: String },
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
    kFactor: { type: Number },
    repeatPairMultiplier: { type: Number },
    previousPairRatedMatches: { type: Number },
  },
  wager: { type: String, default: '0.000000', match: /^\d+\.\d{6}$/ },
  isPrivate: { type: Boolean, default: false },
  inviteTokenHash: { type: String },
  lastActivityAt: { type: Date, required: true, default: () => new Date(), index: true },
  moveHistory: [{
    userId: { type: String, required: true },
    col: { type: Number, required: true },
    row: { type: Number, required: true }
  }]
}, {
  timestamps: true
});

MatchSchema.index({ status: 1, isPrivate: 1, createdAt: -1 });
MatchSchema.index({ status: 1, lastActivityAt: 1, createdAt: 1 });
MatchSchema.index({ player1Id: 1, status: 1, createdAt: -1 });
MatchSchema.index({ player2Id: 1, status: 1, createdAt: -1 });

export const Match = mongoose.model<IMatch>('Match', MatchSchema);
