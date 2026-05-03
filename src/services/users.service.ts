import request from './api/apiClient.ts';
import type { LeaderboardUserDTO, UserProfileDTO } from '../types/api';

export function getLeaderboard(signal?: AbortSignal) {
  return request<LeaderboardUserDTO[]>('/users/leaderboard', signal ? { signal } : undefined);
}

export function getUserProfile(userId: string, signal?: AbortSignal) {
  return request<UserProfileDTO>(`/users/${userId}`, signal ? { signal } : undefined);
}
