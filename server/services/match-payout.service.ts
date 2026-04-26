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

export const DRAW_COMMISSION_RATE = 0.05;

export interface DrawPayoutSummary {
  totalPot: number;
  commissionAmount: number;
  refundPerPlayer: number;
  commissionRate: number;
}

export function calculateDrawPayout(wager: number): DrawPayoutSummary {
  const normalizedWager = Number.isFinite(wager) && wager > 0 ? wager : 0;
  const totalPot = normalizedWager * 2;
  const commissionAmount = totalPot * DRAW_COMMISSION_RATE;
  // Refund per player is (Total Pot - Commission) / 2
  const refundPerPlayer = (totalPot - commissionAmount) / 2;

  return {
    totalPot,
    commissionAmount,
    refundPerPlayer,
    commissionRate: DRAW_COMMISSION_RATE,
  };
}
