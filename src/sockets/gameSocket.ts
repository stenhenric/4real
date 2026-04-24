import { io } from 'socket.io-client';

export function createGameSocket() {
  return io(window.location.origin);
}
