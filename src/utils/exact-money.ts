export type MoneyLike = string | number | null | undefined;

interface NormalizeFixedScaleAmountOptions {
  scale: number;
  allowZero?: boolean;
  label?: string;
}

export function normalizeFixedScaleAmount(
  value: string,
  { scale, allowZero = true, label = 'Amount' }: NormalizeFixedScaleAmountOptions,
): string {
  const trimmed = value.trim();

  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label} must be a plain decimal amount.`);
  }

  const [integerPart = '', fractionPart = ''] = trimmed.split('.');
  if (fractionPart.length > scale) {
    throw new Error(`${label} supports at most ${scale} decimal places.`);
  }

  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fractionPart.padEnd(scale, '0');
  const normalized = `${normalizedInteger}.${normalizedFraction}`;

  if (!allowZero && /^0+$/.test(normalizedInteger) && /^0*$/.test(normalizedFraction)) {
    throw new Error(`${label} must be greater than 0.`);
  }

  return normalized;
}

export function moneyToNumber(value: MoneyLike): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function isPositiveMoney(value: MoneyLike): boolean {
  return moneyToNumber(value) > 0;
}

export function formatMoneyValue(value: MoneyLike, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(moneyToNumber(value));
}
