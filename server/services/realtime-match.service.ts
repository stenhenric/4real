import { MatchService } from './match.service.ts';
import { createRoomStateFromMatch, checkWin, type RoomState } from './game-room.service.ts';
import { GameRoomRegistry } from './game-room-registry.service.ts';
import { UserService } from './user.service.ts';
import { conflict, notFound, unauthorized } from '../utils/http-error.ts';

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
        throw unauthorized('Unauthorized access', 'MATCH_ROOM_REQUIRED');
      }

      const [user, dbMatch] = await Promise.all([
        UserService.findById(userId),
        MatchService.getMatchByRoomId(roomId),
      ]);

      if (!user) {
        throw notFound('User not found', 'USER_NOT_FOUND');
      }

      if (!dbMatch) {
        throw notFound('Match not found', 'MATCH_NOT_FOUND');
      }

      let room = this.roomRegistry.get(roomId);
      if (!room) {
        room = await createRoomStateFromMatch(dbMatch);
        this.roomRegistry.set(roomId, room);
      }

      let activatedRoom = false;
      const expectedPlayerIds = [
        dbMatch.player1Id.toString(),
        dbMatch.player2Id?.toString(),
      ].filter((playerId): playerId is string => Boolean(playerId));
      const roomMembershipDrift =
        expectedPlayerIds.length !== room.players.length
        || expectedPlayerIds.some((playerId) => !room.players.some((entry) => entry.userId === playerId));

      if (dbMatch.status === 'completed') {
        const refreshedRoom = await createRoomStateFromMatch(dbMatch);
        this.roomRegistry.set(roomId, refreshedRoom);
        room = refreshedRoom;
      } else if (
        dbMatch.status !== room.status
        || dbMatch.moveHistory.length !== room.moves.length
        || roomMembershipDrift
      ) {
        activatedRoom = room.status === 'waiting' && dbMatch.status === 'active';
        const knownSocketIds = new Map(room.players.map((entry) => [entry.userId, entry.socketId]));
        room = await createRoomStateFromMatch(dbMatch);
        room.players = room.players.map((entry) => ({
          ...entry,
          socketId: knownSocketIds.get(entry.userId) ?? null,
        }));
        this.roomRegistry.set(roomId, room);
      }

      let player = room.players.find((entry) => entry.userId === userId);

      if (!player) {
        throw conflict(
          'Join the match through the API before opening the realtime room',
          'MATCH_JOIN_REQUIRED',
        );
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
      const dbMatch = await MatchService.getMatchByRoomId(roomId);
      if (!dbMatch || dbMatch.status === 'completed') {
        if (dbMatch) {
          const completedRoom = await createRoomStateFromMatch(dbMatch);
          this.roomRegistry.set(roomId, completedRoom);
        }
        return null;
      }

      let room = this.roomRegistry.get(roomId);
      if (!room) {
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
