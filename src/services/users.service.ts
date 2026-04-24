import request from './api/apiClient';
import type { LeaderboardUserDTO, UserProfileDTO } from '../types/api';

export function getLeaderboard(signal?: AbortSignal) {
  return request<LeaderboardUserDTO[]>('/users/leaderboard', { signal });
}

export function getUserProfile(userId: string, signal?: AbortSignal) {
  return request<UserProfileDTO>(`/users/${userId}`, { signal });
}
