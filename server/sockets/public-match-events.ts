import type { Server } from 'socket.io';

import { PUBLIC_MATCHES_UPDATED_EVENT } from '../../shared/socket-events.ts';

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
