import mongoose from 'mongoose';

import { MatchService } from './match.service.ts';
import { createRoomStateFromMatch, checkWin, type RoomState } from './game-room.service.ts';
import { GameRoomRegistry } from './game-room-registry.service.ts';
import { TransactionService } from './transaction.service.ts';
import { UserService } from './user.service.ts';
import { emitPublicMatchUpdatedEvent } from '../sockets/public-match-events.ts';

export interface JoinRoomResult {
  room: RoomState;
  activatedRoom: boolean;
}

export interface MoveMadeResult {
  type: 'move-made';
  room: RoomState;
}

export interface GameOverResult {
  type: 'game-over';
  room: RoomState;
  winnerId: string;
  winningLine?: [number, number][];
}

export type MakeMoveResult = MoveMadeResult | GameOverResult | null;

export class RealtimeMatchService {
  constructor(private readonly roomRegistry: GameRoomRegistry) {}

  async joinRoom({
    roomId,
    userId,
    socketId,
  }: {
    roomId: string;
    userId: string;
    socketId: string;
  }): Promise<JoinRoomResult> {
    return this.roomRegistry.runExclusive(roomId, async () => {
      if (roomId.trim().length === 0) {
        throw new Error('Unauthorized access');
      }

      const [user, dbMatch] = await Promise.all([
        UserService.findById(userId),
        MatchService.getMatchByRoomId(roomId),
      ]);

      if (!user) {
        throw new Error('User not found');
      }

      if (!dbMatch) {
        throw new Error('Match not found');
      }

      let room = this.roomRegistry.get(roomId);
      if (!room) {
        room = await createRoomStateFromMatch(dbMatch);
        this.roomRegistry.set(roomId, room);
      }

      let activatedRoom = false;
      let player = room.players.find((entry) => entry.userId === userId);

      if (!player) {
        const player1Id = dbMatch.player1Id.toString();
        const player2Id = dbMatch.player2Id?.toString();

        if (player2Id && player2Id !== userId) {
          throw new Error('Match is already full');
        }

        if (userId !== player1Id) {
          const knownSocketIds = new Map(room.players.map((entry) => [entry.userId, entry.socketId]));
          const session = await mongoose.startSession();

          try {
            await session.withTransaction(async () => {
              const txMatch = await MatchService.getMatchByRoomId(roomId, session);
              if (!txMatch) {
                throw new Error('Match not found');
              }

              if (txMatch.player2Id && txMatch.player2Id.toString() !== userId) {
                throw new Error('Match is already full');
              }

              if (room.wager > 0) {
                const updatedUser = await UserService.deductBalanceSafely(userId, room.wager, session);
                if (!updatedUser) {
                  throw new Error('Insufficient balance to join this match');
                }

                await TransactionService.createTransaction({
                  userId,
                  type: 'MATCH_WAGER',
                  amount: -room.wager,
                  referenceId: roomId,
                  session,
                });
              }

              txMatch.player2Id = user._id;
              txMatch.p2Username = user.username;
              txMatch.status = 'active';
              await txMatch.save({ session });
            });
          } finally {
            await session.endSession();
          }

          const refreshedMatch = await MatchService.getMatchByRoomId(roomId);
          if (!refreshedMatch) {
            throw new Error('Match not found');
          }

          emitPublicMatchUpdatedEvent({
            roomId: refreshedMatch.roomId,
            status: refreshedMatch.status,
            isPrivate: refreshedMatch.isPrivate,
          });

          room = await createRoomStateFromMatch(refreshedMatch);
          room.players = room.players.map((entry) => ({
            ...entry,
            socketId: knownSocketIds.get(entry.userId) ?? null,
          }));
          activatedRoom = true;
        }

        this.roomRegistry.set(roomId, room);
        player = room.players.find((entry) => entry.userId === userId);
      }

      if (!player) {
        throw new Error('Unable to join match');
      }

      player.socketId = socketId;
      this.roomRegistry.touch(roomId);

      return {
        room,
        activatedRoom,
      };
    });
  }

  async makeMove({
    roomId,
    userId,
    col,
  }: {
    roomId: string;
    userId: string;
    col: number;
  }): Promise<MakeMoveResult> {
    return this.roomRegistry.runExclusive(roomId, async () => {
      let room = this.roomRegistry.get(roomId);
      if (!room) {
        const dbMatch = await MatchService.getMatchByRoomId(roomId);
        if (!dbMatch) {
          return null;
        }

        room = await createRoomStateFromMatch(dbMatch);
        this.roomRegistry.set(roomId, room);
      }

      const isParticipant = room.players.some((player) => player.userId === userId);
      if (!isParticipant || room.status !== 'active' || room.currentTurn !== userId) {
        return null;
      }

      let row = -1;
      for (let currentRow = 5; currentRow >= 0; currentRow -= 1) {
        if (room.board[currentRow][col] === null) {
          row = currentRow;
          break;
        }
      }

      if (row === -1) {
        return null;
      }

      const playerIndex = room.players.findIndex((player) => player.userId === userId);
      const symbol = playerIndex === 0 ? 'R' : 'B';

      room.board[row][col] = symbol;
      room.moves.push({ userId, col, row });
      this.roomRegistry.touch(roomId);

      const winner = checkWin(room.board, row, col, symbol);
      if (winner) {
        room.status = 'completed';
        room.currentTurn = null;
        room.winnerId = userId;
        await MatchService.completeMatch(roomId, userId, room.moves);

        return {
          type: 'game-over',
          room,
          winnerId: userId,
          winningLine: winner,
        };
      }

      if (room.moves.length === 42) {
        room.status = 'completed';
        room.currentTurn = null;
        room.winnerId = 'draw';
        await MatchService.completeMatch(roomId, 'draw', room.moves);

        return {
          type: 'game-over',
          room,
          winnerId: 'draw',
        };
      }

      room.currentTurn = room.players.find((player) => player.userId !== userId)?.userId ?? null;
      await MatchService.persistMoveHistory(roomId, room.moves);

      return {
        type: 'move-made',
        room,
      };
    });
  }

  handleDisconnect(socketId: string): void {
    this.roomRegistry.detachSocket(socketId);
  }
}
