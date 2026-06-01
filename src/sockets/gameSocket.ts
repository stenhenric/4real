import { io } from 'socket.io-client';
import { SOCKET_IO_TRANSPORTS } from '../../shared/socket-config';

export function createGameSocket() {
  return io(window.location.origin, {
    transports: [...SOCKET_IO_TRANSPORTS],
  });
}
