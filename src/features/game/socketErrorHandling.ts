export interface GameSocketError {
  code?: string;
  message: string;
}

const FATAL_ROOM_ERROR_CODES = new Set([
  'ACCOUNT_SETUP_INCOMPLETE',
  'INVALID_TOKEN',
  'MATCH_FORBIDDEN',
  'MATCH_NOT_FOUND',
  'MATCH_ROOM_REQUIRED',
  'UNAUTHENTICATED',
  'USER_NOT_FOUND',
]);

const FRIENDLY_SOCKET_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_SETUP_INCOMPLETE: 'Finish account setup before joining this match.',
  INVALID_TOKEN: 'Your session expired. Please sign in again.',
  JOIN_ROOM_RATE_LIMITED: 'Too many room join attempts. Please wait a moment.',
  MAKE_MOVE_RATE_LIMITED: 'Too many move attempts. Please slow down.',
  MATCH_FORBIDDEN: 'You do not have access to this match.',
  MATCH_NOT_FOUND: 'This match is no longer available.',
  MATCH_ROOM_REQUIRED: 'This match link is invalid.',
  SOCKET_CONNECT_ERROR: 'Connection to the game server failed. Please try again.',
  SOCKET_ERROR: 'The move could not be processed. Please try again.',
  UNAUTHENTICATED: 'Please sign in again to continue.',
  USER_NOT_FOUND: 'Your account could not be loaded. Please sign in again.',
};

export function shouldLeaveGameRoomAfterSocketError(error: GameSocketError): boolean {
  return Boolean(error.code && FATAL_ROOM_ERROR_CODES.has(error.code));
}

export function getGameSocketErrorMessage(error: GameSocketError): string {
  const friendlyMessage = error.code ? FRIENDLY_SOCKET_ERROR_MESSAGES[error.code] : undefined;
  if (friendlyMessage) {
    return friendlyMessage;
  }

  return error.message || 'The game server could not process that action.';
}

export function shouldLeaveGameRoomAfterJoinError(code: string | undefined): boolean {
  return Boolean(code && [
    'MATCH_ALREADY_FULL',
    'MATCH_ALREADY_SETTLED',
    'MATCH_NOT_FOUND',
  ].includes(code));
}
