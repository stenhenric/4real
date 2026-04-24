import request from './api/apiClient';
import type { MerchantConfigDTO, OrderDTO } from '../types/api';

interface CreateOrderPayload {
  type: 'BUY' | 'SELL';
  amount: number;
  proofImageUrl: string;
}

type OrderStatus = OrderDTO['status'];

export function getOrders(signal?: AbortSignal) {
  return request<OrderDTO[]>('/orders', { signal });
}

export function getMerchantConfig(signal?: AbortSignal) {
  return request<MerchantConfigDTO>('/orders/config', { signal });
}

export function createOrder(payload: CreateOrderPayload) {
  return request<OrderDTO>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return request<OrderDTO>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
