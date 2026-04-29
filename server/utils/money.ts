import mongoose from 'mongoose';

const MICRO_UNITS_PER_USDT = 1_000_000n;

export type DecimalLike = mongoose.Types.Decimal128 | { toString(): string };

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

export function rawAmountToUsdtNumber(value: bigint | string | number): number {
  const raw = typeof value === 'bigint' ? value : BigInt(value);
  return Number(raw) / Number(MICRO_UNITS_PER_USDT);
}

export function usdtNumberToRawAmount(value: number): bigint {
  return BigInt(Math.round(value * Number(MICRO_UNITS_PER_USDT)));
}

export function rawAmountToDisplayString(value: bigint | string | number): string {
  return rawAmountToUsdtNumber(value).toFixed(6);
}
