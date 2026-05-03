import {
  divideRounded,
  formatRate,
  formatUsdtAmount,
  parseRate,
  parseUsdtAmount,
} from '../utils/money.ts';

const BASIS_POINTS_DIVISOR = 10_000n;
const MATCH_COMMISSION_BPS = 1_000n;
const DRAW_COMMISSION_BPS = 500n;

export const MATCH_COMMISSION_RATE = formatRate(parseRate('0.100000'));

export interface MatchPayoutSummary {
  totalPot: string;
  totalPotRaw: string;
  commissionAmount: string;
  commissionAmountRaw: string;
  projectedWinnerAmount: string;
  projectedWinnerAmountRaw: string;
  commissionRate: string;
}

function normalizeUsdtRawAmount(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value > 0n ? value : 0n;
  }

  const parsed = parseUsdtAmount(value);
  return parsed > 0n ? parsed : 0n;
}

export function calculateMatchPayout(wager: string | number | bigint): MatchPayoutSummary {
  const normalizedWagerRaw = normalizeUsdtRawAmount(wager);
  const totalPotRaw = normalizedWagerRaw * 2n;
  const commissionAmountRaw = divideRounded(
    totalPotRaw * MATCH_COMMISSION_BPS,
    BASIS_POINTS_DIVISOR,
    'down',
  );
  const projectedWinnerAmountRaw = totalPotRaw - commissionAmountRaw;

  return {
    totalPot: formatUsdtAmount(totalPotRaw),
    totalPotRaw: totalPotRaw.toString(),
    commissionAmount: formatUsdtAmount(commissionAmountRaw),
    commissionAmountRaw: commissionAmountRaw.toString(),
    projectedWinnerAmount: formatUsdtAmount(projectedWinnerAmountRaw),
    projectedWinnerAmountRaw: projectedWinnerAmountRaw.toString(),
    commissionRate: MATCH_COMMISSION_RATE,
  };
}

export function calculateProjectedWinnerAmount(wager: string | number | bigint): string {
  return calculateMatchPayout(wager).projectedWinnerAmount;
}

export const DRAW_COMMISSION_RATE = formatRate(parseRate('0.050000'));

export interface DrawPayoutSummary {
  totalPot: string;
  totalPotRaw: string;
  commissionAmount: string;
  commissionAmountRaw: string;
  refundPerPlayer: string;
  refundPerPlayerRaw: string;
  commissionRate: string;
}

export function calculateDrawPayout(wager: string | number | bigint): DrawPayoutSummary {
  const normalizedWagerRaw = normalizeUsdtRawAmount(wager);
  const totalPotRaw = normalizedWagerRaw * 2n;
  const commissionAmountRaw = divideRounded(
    totalPotRaw * DRAW_COMMISSION_BPS,
    BASIS_POINTS_DIVISOR,
    'down',
  );
  const refundPerPlayerRaw = (totalPotRaw - commissionAmountRaw) / 2n;

  return {
    totalPot: formatUsdtAmount(totalPotRaw),
    totalPotRaw: totalPotRaw.toString(),
    commissionAmount: formatUsdtAmount(commissionAmountRaw),
    commissionAmountRaw: commissionAmountRaw.toString(),
    refundPerPlayer: formatUsdtAmount(refundPerPlayerRaw),
    refundPerPlayerRaw: refundPerPlayerRaw.toString(),
    commissionRate: DRAW_COMMISSION_RATE,
  };
}
