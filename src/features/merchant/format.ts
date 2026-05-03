import { moneyToNumber, type MoneyLike } from '../../utils/exact-money.ts';

export function formatMoney(value: MoneyLike): string {
  const amount = moneyToNumber(value);
  if (!Number.isFinite(amount)) {
    return 'Unavailable';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactNumber(value: MoneyLike): string {
  const amount = moneyToNumber(value);
  if (!Number.isFinite(amount)) {
    return 'Unavailable';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return 'Unavailable';
  }

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeMinutes(minutes: number): string {
  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return remainder > 0 ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
