import request from './api/apiClient.ts';
import type { AvatarSettingsDTO, LeaderboardUserDTO, UserProfileDTO } from '../types/api';

export function getLeaderboard(signal?: AbortSignal) {
  return request<LeaderboardUserDTO[] | null>('/users/leaderboard', signal ? { signal } : undefined)
    .then((leaderboard) => (Array.isArray(leaderboard) ? leaderboard : []));
}

export function getUserProfile(userId: string, signal?: AbortSignal) {
  return request<UserProfileDTO>(`/users/${encodeURIComponent(userId)}`, signal ? { signal } : undefined);
}

export function updateAvatarSettings(payload: AvatarSettingsDTO) {
  return request<UserProfileDTO>('/users/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
