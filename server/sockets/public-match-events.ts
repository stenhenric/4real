import type { Server } from 'socket.io';

import { PUBLIC_MATCHES_UPDATED_EVENT } from '../../shared/socket-events.ts';
import type { IMatch } from '../models/Match.ts';
import { createRoomStateFromMatch } from '../services/game-room.service.ts';
import { logger } from '../utils/logger.ts';

let socketServer: Server | null = null;

interface PublicMatchUpdate {
  roomId: string;
  status: 'waiting' | 'active' | 'completed';
  isPrivate: boolean;
}

export function registerPublicMatchEvents(io: Server): void {
  socketServer = io;
}

export function emitPublicMatchUpdatedEvent(match: PublicMatchUpdate): void {
  if (!socketServer || match.isPrivate) {
    return;
  }

  socketServer.emit(PUBLIC_MATCHES_UPDATED_EVENT, {
    roomId: match.roomId,
    status: match.status,
  });
}

export async function emitMatchRoomUpdatedEvent(match: IMatch): Promise<void> {
  if (!socketServer) {
    return;
  }

  try {
    const room = await createRoomStateFromMatch(match);
    if (room.status === 'completed' && room.winnerId) {
      socketServer.to(room.roomId).emit('game-over', {
        room,
        winnerId: room.winnerId,
        ...(room.outcome ? { outcome: room.outcome } : {}),
        ...(room.ratingResult ? { ratingResult: room.ratingResult } : {}),
      });
      return;
    }

    socketServer.to(room.roomId).emit(room.status === 'active' ? 'game-started' : 'room-sync', room);
  } catch (error) {
    logger.error('match.room_event_emit_failed', {
      roomId: match.roomId,
      status: match.status,
      error,
    });
  }
}
