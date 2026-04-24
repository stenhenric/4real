import request from './api/apiClient';
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
    body: JSON.stringify(payload),
  });
}

export function getUserMatches(userId: string, signal?: AbortSignal) {
  return request<MatchDTO[]>(`/matches/user/${userId}`, { signal });
}
