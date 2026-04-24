import request from './api/apiClient';
import type { MerchantDashboardDTO, MerchantOrderDeskResponseDTO } from '../types/api';

interface MerchantOrderQuery {
  page?: number;
  pageSize?: number;
  status?: 'ALL' | 'PENDING' | 'DONE' | 'REJECTED';
  type?: 'ALL' | 'BUY' | 'SELL';
  signal?: AbortSignal;
}

export function getMerchantDashboard(signal?: AbortSignal) {
  return request<MerchantDashboardDTO>('/admin/merchant/dashboard', { signal });
}

export function getMerchantOrders(query: MerchantOrderQuery = {}) {
  const params = new URLSearchParams();

  if (query.page) {
    params.set('page', String(query.page));
  }

  if (query.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.status) {
    params.set('status', query.status);
  }

  if (query.type) {
    params.set('type', query.type);
  }

  const queryString = params.toString();
  const endpoint = queryString.length > 0
    ? `/admin/merchant/orders?${queryString}`
    : '/admin/merchant/orders';

  return request<MerchantOrderDeskResponseDTO>(endpoint, { signal: query.signal });
}
