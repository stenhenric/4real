import request from './api/apiClient';
import type { MerchantConfigDTO, UpdateMerchantConfigRequestDTO } from '../types/api';

export function getMerchantAdminConfig(signal?: AbortSignal) {
  return request<MerchantConfigDTO>('/admin/merchant/config', signal ? { signal } : undefined);
}

export function updateMerchantAdminConfig(payload: UpdateMerchantConfigRequestDTO) {
  return request<MerchantConfigDTO>('/admin/merchant/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
