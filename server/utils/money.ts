import mongoose from 'mongoose';

export const USDT_SCALE = 6;
export const KES_SCALE = 2;
export const RATE_SCALE = 6;

const MICRO_UNITS_PER_USDT = 10n ** BigInt(USDT_SCALE);

export type DecimalLike = mongoose.Types.Decimal128 | { toString(): string };
export type FixedScaleInput = string | number | bigint;

export function decimal128FromRaw(value: bigint | string | number): mongoose.Types.Decimal128 {
  return mongoose.Types.Decimal128.fromString(value.toString());
}

export function rawToDecimal128Expression(path: string, fallbackPath?: string): Record<string, unknown> {
  return {
    $ifNull: [
      path,
      {
        $toDecimal: fallbackPath ?? '0',
      },
    ],
  };
}

export function decimalLikeToBigInt(value: DecimalLike | null | undefined): bigint {
  if (!value) {
    return 0n;
  }

  const normalized = value.toString().trim();
  const integerToken = normalized.split('.', 1)[0] ?? '0';
  return BigInt(integerToken === '' ? '0' : integerToken);
}

export function parseRawAmount(value?: string | null): bigint {
  return BigInt(value ?? '0');
}

function getScaleFactor(scale: number): bigint {
  return 10n ** BigInt(scale);
}

function normalizeFixedScaleInput(value: FixedScaleInput): string {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new Error('Money value cannot be empty');
    }

    return normalized;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (!Number.isFinite(value)) {
    throw new Error('Money value must be finite');
  }

  return value.toString();
}

export function parseFixedScale(value: FixedScaleInput, scale: number): bigint {
  const normalized = normalizeFixedScaleInput(value);
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid decimal value "${normalized}"`);
  }

  const [, signToken = '', wholePart = '0', fractionalPart = ''] = match;
  if (fractionalPart.length > scale) {
    throw new Error(`Value "${normalized}" exceeds ${scale} decimal places`);
  }

  const paddedFraction = fractionalPart.padEnd(scale, '0');
  const raw = BigInt(`${wholePart}${paddedFraction}` || '0');
  return signToken === '-' ? -raw : raw;
}

export function formatFixedScale(rawValue: FixedScaleInput, scale: number): string {
  const raw = typeof rawValue === 'bigint'
    ? rawValue
    : parseRawAmount(rawValue.toString());
  const sign = raw < 0n ? '-' : '';
  const absolute = raw < 0n ? -raw : raw;
  const scaleFactor = getScaleFactor(scale);
  const whole = absolute / scaleFactor;
  const fraction = absolute % scaleFactor;

  return `${sign}${whole.toString()}.${fraction.toString().padStart(scale, '0')}`;
}

export function parseUsdtAmount(value: FixedScaleInput): bigint {
  return parseFixedScale(value, USDT_SCALE);
}

export function formatUsdtAmount(rawValue: FixedScaleInput): string {
  return formatFixedScale(rawValue, USDT_SCALE);
}

export function parseKesAmount(value: FixedScaleInput): bigint {
  return parseFixedScale(value, KES_SCALE);
}

export function formatKesAmount(rawValue: FixedScaleInput): string {
  return formatFixedScale(rawValue, KES_SCALE);
}

export function parseRate(value: FixedScaleInput): bigint {
  return parseFixedScale(value, RATE_SCALE);
}

export function formatRate(rawValue: FixedScaleInput): string {
  return formatFixedScale(rawValue, RATE_SCALE);
}

export function divideRounded(
  dividend: bigint,
  divisor: bigint,
  mode: 'half-up' | 'down' = 'half-up',
): bigint {
  if (divisor === 0n) {
    throw new Error('Cannot divide by zero');
  }

  if (mode === 'down') {
    return dividend / divisor;
  }

  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  if (remainder === 0n) {
    return quotient;
  }

  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  const shouldRoundAway = absoluteRemainder * 2n >= absoluteDivisor;
  if (!shouldRoundAway) {
    return quotient;
  }

  return quotient + (dividend > 0n === divisor > 0n ? 1n : -1n);
}

export function multiplyScaledAmounts(params: {
  leftRaw: bigint;
  leftScale: number;
  rightRaw: bigint;
  rightScale: number;
  resultScale: number;
  rounding?: 'half-up' | 'down';
}): bigint {
  const numerator = params.leftRaw * params.rightRaw;
  const scaleDelta = (params.leftScale + params.rightScale) - params.resultScale;
  if (scaleDelta < 0) {
    return numerator * getScaleFactor(-scaleDelta);
  }

  return divideRounded(
    numerator,
    getScaleFactor(scaleDelta),
    params.rounding ?? 'half-up',
  );
}

export function rawAmountToUsdtNumber(value: bigint | string | number): number {
  const raw = typeof value === 'bigint' ? value : BigInt(value);
  return Number(raw) / Number(MICRO_UNITS_PER_USDT);
}

export function usdtNumberToRawAmount(value: number): bigint {
  return parseUsdtAmount(value);
}

export function rawAmountToDisplayString(value: bigint | string | number): string {
  return formatUsdtAmount(typeof value === 'bigint' ? value : BigInt(value));
}
