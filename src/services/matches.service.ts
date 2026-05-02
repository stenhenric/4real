import request from './api/apiClient.ts';
import { createIdempotencyKey } from '../utils/idempotency.ts';
import type { MatchDTO } from '../types/api.ts';

interface CreateMatchPayload {
  wager: number;
  isPrivate: boolean;
}

function normalizeInviteToken(inviteToken?: string): string | undefined {
  const trimmed = inviteToken?.trim();
  return trimmed ? trimmed : undefined;
}

export function getActiveMatches(signal?: AbortSignal) {
  return request<MatchDTO[]>('/matches/active', signal ? { signal } : undefined);
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
  return request<MatchDTO[]>(`/matches/user/${userId}`, signal ? { signal } : undefined);
}

export function getMatch(roomId: string, signal?: AbortSignal, inviteToken?: string) {
  const normalizedInviteToken = normalizeInviteToken(inviteToken);
  const query = normalizedInviteToken ? `?invite=${encodeURIComponent(normalizedInviteToken)}` : '';
  return request<MatchDTO>(`/matches/${roomId}${query}`, signal ? { signal } : undefined);
}

export function joinMatch(roomId: string, inviteToken?: string) {
  const normalizedInviteToken = normalizeInviteToken(inviteToken);
  return request<MatchDTO>(`/matches/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
      ...(normalizedInviteToken ? { 'X-Match-Invite': normalizedInviteToken } : {}),
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
