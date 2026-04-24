import mongoose, { Document, Schema } from 'mongoose';

export interface IMatch extends Document {
  roomId: string;
  player1Id: mongoose.Types.ObjectId;
  player2Id?: mongoose.Types.ObjectId;
  p1Username: string;
  p2Username?: string;
  status: 'waiting' | 'active' | 'completed';
  winnerId?: string; // 'draw', player1Id, or player2Id
  wager: number;
  isPrivate: boolean;
  moveHistory: { userId: string; col: number; row: number }[];
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
  wager: { type: Number, default: 0, min: 0 },
  isPrivate: { type: Boolean, default: false },
  moveHistory: [{
    userId: { type: String, required: true },
    col: { type: Number, required: true },
    row: { type: Number, required: true }
  }]
}, {
  timestamps: true
});

MatchSchema.index({ status: 1, isPrivate: 1, createdAt: -1 });
MatchSchema.index({ player1Id: 1, status: 1, createdAt: -1 });
MatchSchema.index({ player2Id: 1, status: 1, createdAt: -1 });

export const Match = mongoose.model<IMatch>('Match', MatchSchema);
