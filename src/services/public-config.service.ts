import request from './api/apiClient.ts';
import type { PublicConfigDTO } from '../types/api';

export function getPublicConfig(signal?: AbortSignal) {
  return request<PublicConfigDTO>('/public-config', {
    ...(signal ? { signal } : {}),
    skipAuthRefresh: true,
  });
}
