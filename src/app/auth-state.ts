import type { AuthResponseDTO, SessionListItemDTO } from '../types/api';

export function resolveCurrentSession(
  currentSession: SessionListItemDTO | null,
  response: AuthResponseDTO | null,
): SessionListItemDTO | null {
  if (!response?.user) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(response, 'session')) {
    return response.session ?? null;
  }

  return currentSession;
}
