import { moneyToNumber, type MoneyLike } from '../../utils/exact-money.ts';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatMoney(value: MoneyLike): string {
  if (value === null || value === undefined) {
    return 'Unavailable';
  }

  const amount = moneyToNumber(value);
  if (!Number.isFinite(amount) || (typeof value === 'string' && !Number.isFinite(Number(value)))) {
    return 'Unavailable';
  }

  return moneyFormatter.format(amount);
}

export function formatCompactNumber(value: MoneyLike): string {
  if (value === null || value === undefined) {
    return 'Unavailable';
  }

  const amount = moneyToNumber(value);
  if (!Number.isFinite(amount) || (typeof value === 'string' && !Number.isFinite(Number(value)))) {
    return 'Unavailable';
  }

  return compactNumberFormatter.format(amount);
}

export function formatDateTime(value: string | number | undefined): string {
  if (!value) {
    return 'Unavailable';
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleString([], {
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
