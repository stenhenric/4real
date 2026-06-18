import { formatMoneyValue, moneyToNumber } from '../../utils/exact-money.ts';
import type { GameOverState, RoomState } from './types';

interface VerdictPresentationInput {
  gameOver: GameOverState;
  isDraw: boolean;
  isWin: boolean;
  room: RoomState;
}

export interface ResignActionPresentation {
  accessibleWarning: string;
  buttonLabel: string;
  confirmButtonLabel: string;
  confirmMessage: string;
  pendingLabel: string;
}

export function getResignActionPresentation(room: RoomState): ResignActionPresentation {
  const wagerLabel = formatMoneyValue(room.wager);
  const isWaitingCancellation = room.status === 'waiting';

  if (isWaitingCancellation) {
    return {
      accessibleWarning: `Canceling will refund your locked wager of ${wagerLabel} USDT.`,
      buttonLabel: 'Cancel Match',
      confirmButtonLabel: 'Yes, Cancel',
      confirmMessage: `Canceling will refund your ${wagerLabel} USDT locked wager.`,
      pendingLabel: 'Canceling...',
    };
  }

  return {
    accessibleWarning: `Warning: resigning will forfeit your wager of ${wagerLabel} USDT.`,
    buttonLabel: 'Resign Match',
    confirmButtonLabel: 'Yes, Resign',
    confirmMessage: `Resigning will forfeit your ${wagerLabel} USDT wager.`,
    pendingLabel: 'Resigning...',
  };
}

export function getVerdictHeadline({
  gameOver,
  isDraw,
  isWin,
  room,
}: VerdictPresentationInput): string {
  if (room.settlementReason === 'resigned' && gameOver.outcome === 'no_contest') {
    return 'Match canceled';
  }

  if (room.settlementReason === 'waiting_expired' && gameOver.outcome === 'no_contest') {
    return 'Match expired';
  }

  if (room.settlementReason === 'active_expired') {
    return isWin ? 'Opponent timed out' : 'You timed out';
  }

  if (room.settlementReason === 'resigned') {
    return isWin ? 'Opponent resigned' : 'You resigned';
  }

  if (isDraw || gameOver.outcome === 'draw') {
    return 'This match is a draw';
  }

  return isWin ? 'You are victorious!' : 'You lost this match';
}

export function getVerdictMessage({
  gameOver,
  isDraw,
  isWin,
  room,
}: VerdictPresentationInput): string {
  const hasWager = moneyToNumber(room.wager) > 0;

  if (room.settlementReason === 'resigned' && gameOver.outcome === 'no_contest') {
    return hasWager
      ? 'The waiting match was canceled and your locked wager was refunded.'
      : 'The waiting match was canceled before an opponent joined.';
  }

  if (room.settlementReason === 'waiting_expired' && gameOver.outcome === 'no_contest') {
    return hasWager
      ? 'No opponent joined in time, so the locked wager was refunded.'
      : 'No opponent joined in time, so the match was closed.';
  }

  if (room.settlementReason === 'active_expired') {
    return isWin
      ? 'Your opponent timed out. The match was settled in your favor.'
      : 'You timed out. The match was settled for your opponent.';
  }

  if (room.settlementReason === 'resigned') {
    return isWin
      ? 'Your opponent resigned. The match was settled in your favor.'
      : 'Your resignation was recorded. The match was settled for your opponent.';
  }

  if (isDraw || gameOver.outcome === 'draw') {
    return 'Both players keep the draw result recorded on this match.';
  }

  return isWin
    ? 'The final move completed the win and the match is now settled.'
    : 'The final move completed the loss and the match is now settled.';
}
