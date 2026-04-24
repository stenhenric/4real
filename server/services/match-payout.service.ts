export const MATCH_COMMISSION_RATE = 0.1;

export interface MatchPayoutSummary {
  totalPot: number;
  commissionAmount: number;
  projectedWinnerAmount: number;
  commissionRate: number;
}

export function calculateMatchPayout(wager: number): MatchPayoutSummary {
  const normalizedWager = Number.isFinite(wager) && wager > 0 ? wager : 0;
  const totalPot = normalizedWager * 2;
  const commissionAmount = totalPot * MATCH_COMMISSION_RATE;
  const projectedWinnerAmount = totalPot - commissionAmount;

  return {
    totalPot,
    commissionAmount,
    projectedWinnerAmount,
    commissionRate: MATCH_COMMISSION_RATE,
  };
}

export function calculateProjectedWinnerAmount(wager: number): number {
  return calculateMatchPayout(wager).projectedWinnerAmount;
}
