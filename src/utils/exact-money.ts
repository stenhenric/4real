export type MoneyLike = string | number | null | undefined;

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

export function formatMoneyValue(value: MoneyLike, fractionDigits = 2): string {
  return moneyToNumber(value).toFixed(fractionDigits);
}
