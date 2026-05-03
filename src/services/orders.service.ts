import request from './api/apiClient.ts';
import { createIdempotencyKey } from '../utils/idempotency.ts';
import type { MerchantConfigDTO, OrderDTO } from '../types/api';

type CreateOrderPayload =
  | {
      type: 'BUY';
      amount: string;
      transactionCode: string;
      proofImage: File;
    }
  | {
      type: 'SELL';
      amount: string;
    };

type OrderStatus = OrderDTO['status'];

export function getOrders(signal?: AbortSignal) {
  return request<OrderDTO[]>('/orders', signal ? { signal } : undefined);
}

export function getMerchantConfig(signal?: AbortSignal) {
  return request<MerchantConfigDTO>('/orders/config', signal ? { signal } : undefined);
}

export function createOrder(payload: CreateOrderPayload) {
  const form = new FormData();
  form.set('type', payload.type);
  form.set('amount', String(payload.amount));
  if (payload.type === 'BUY') {
    form.set('transactionCode', payload.transactionCode);
    form.set('proofImage', payload.proofImage);
  }

  return request<OrderDTO>('/orders', {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
    body: form,
  });
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return request<OrderDTO>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
