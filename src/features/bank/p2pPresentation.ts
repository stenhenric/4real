import type { MerchantConfigDTO, OrderDTO } from '../../types/api';
import { formatMoneyValue, normalizeFixedScaleAmount } from '../../utils/exact-money.ts';

type P2pTradeType = 'buy' | 'sell';

export interface P2pTradeRequirementsInput {
  type: P2pTradeType;
  hasValidAmount: boolean;
  rateConfigured: boolean;
  paymentConfirmed?: boolean;
  hasTransactionCode?: boolean;
  hasProofImage?: boolean;
  hasMpesaNumber?: boolean;
  hasMpesaName?: boolean;
  sellAmountWithinAvailable?: boolean;
}

export interface P2pCompactSummaryInput {
  availableBalance: string | number | null | undefined;
  pendingOrderCount: number;
  merchantConfig: MerchantConfigDTO | null;
}

const ORDER_STATUS_LABELS: Record<OrderDTO['status'], string> = {
  PENDING: 'Pending',
  DONE: 'Completed',
  REJECTED: 'Failed',
};

export function getP2pOrderStatusLabel(status: OrderDTO['status']): string {
  return ORDER_STATUS_LABELS[status] ?? 'Needs attention';
}

export function formatP2pOrderReference(orderId: string): string {
  return `Order ${orderId.slice(0, 11)}`;
}

export function getPendingP2pOrders(orders: OrderDTO[]): OrderDTO[] {
  return orders.filter((order) => order.status === 'PENDING');
}

export function getP2pCompactSummary(input: P2pCompactSummaryInput) {
  const fiatCurrency = input.merchantConfig?.fiatCurrency ?? 'KES';

  return {
    availableBalance: formatMoneyValue(input.availableBalance),
    pendingOrders: String(input.pendingOrderCount),
    buyRate: input.merchantConfig
      ? `${formatMoneyValue(input.merchantConfig.buyRateKesPerUsdt)} ${fiatCurrency}`
      : 'Loading...',
    sellRate: input.merchantConfig
      ? `${formatMoneyValue(input.merchantConfig.sellRateKesPerUsdt)} ${fiatCurrency}`
      : 'Loading...',
  };
}

function fixedScaleRaw(value: string): bigint {
  const normalized = normalizeFixedScaleAmount(value, {
    scale: 6,
    allowZero: true,
    label: 'USDT amount',
  });
  const [integerPart = '0', fractionPart = ''] = normalized.split('.');
  return BigInt(`${integerPart}${fractionPart.padEnd(6, '0')}`);
}

export function isSellAmountWithinAvailableBalance(
  availableBalanceUsdt: string | number | null | undefined,
  sellAmountUsdt: string | null,
): boolean {
  if (!sellAmountUsdt) {
    return true;
  }

  try {
    return fixedScaleRaw(sellAmountUsdt) <= fixedScaleRaw(String(availableBalanceUsdt ?? '0'));
  } catch {
    return false;
  }
}

export function getP2pTradeSummary(order: Pick<OrderDTO, 'type'>): string {
  return order.type === 'BUY' ? 'Buy USDT' : 'Sell USDT';
}

export function getP2pTradeRequirements(input: P2pTradeRequirementsInput): string[] {
  const requirements: string[] = [];

  if (!input.rateConfigured) {
    requirements.push('P2P rate is temporarily unavailable.');
  }

  if (!input.hasValidAmount) {
    requirements.push('Enter a valid USDT amount.');
  }

  if (input.type === 'buy') {
    if (!input.paymentConfirmed) {
      requirements.push('Confirm that you sent the exact M-Pesa payment.');
      return requirements;
    }

    if (!input.hasTransactionCode) {
      requirements.push('Enter your M-Pesa transaction code.');
    }
    if (!input.hasProofImage) {
      requirements.push('Upload your M-Pesa payment screenshot.');
    }
    return requirements;
  }

  if (input.sellAmountWithinAvailable === false) {
    requirements.push('Sell amount must be within your available USDT balance.');
  }
  if (!input.hasMpesaNumber) {
    requirements.push('Enter your M-Pesa phone number.');
  }
  if (!input.hasMpesaName) {
    requirements.push('Enter the registered M-Pesa name.');
  }

  return requirements;
}
