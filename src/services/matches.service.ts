import request from './api/apiClient';
import { createIdempotencyKey } from '../utils/idempotency';
import type { MatchDTO } from '../types/api';

interface CreateMatchPayload {
  wager: number;
  isPrivate: boolean;
}

export function getActiveMatches(signal?: AbortSignal) {
  return request<MatchDTO[]>('/matches/active', { signal });
}

export function createMatch(payload: CreateMatchPayload) {
  return request<MatchDTO>('/matches', {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
}

export function getUserMatches(userId: string, signal?: AbortSignal) {
  return request<MatchDTO[]>(`/matches/user/${userId}`, { signal });
}

export function getMatch(roomId: string, signal?: AbortSignal) {
  return request<MatchDTO>(`/matches/${roomId}`, { signal });
}

export function joinMatch(roomId: string) {
  return request<MatchDTO>(`/matches/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
  });
}

export function resignMatch(roomId: string) {
  return request<MatchDTO>(`/matches/${roomId}/resign`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
  });
}
