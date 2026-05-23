export const TURNSTILE_RECOVERY_MESSAGE = 'Bot verification could not load. Check your connection and retry.';

export interface TurnstileWidgetState {
  errorMessage: string | null;
  retryNonce: number;
  hasToken: boolean;
}

export type TurnstileWidgetAction =
  | { type: 'script_failed' }
  | { type: 'widget_failed' }
  | { type: 'retry' }
  | { type: 'success' }
  | { type: 'expired' };

export function createInitialTurnstileWidgetState(): TurnstileWidgetState {
  return {
    errorMessage: null,
    retryNonce: 0,
    hasToken: false,
  };
}

export function reduceTurnstileWidgetState(
  state: TurnstileWidgetState,
  action: TurnstileWidgetAction,
): TurnstileWidgetState {
  switch (action.type) {
    case 'script_failed':
    case 'widget_failed':
      return {
        ...state,
        errorMessage: TURNSTILE_RECOVERY_MESSAGE,
        hasToken: false,
      };
    case 'retry':
      return {
        errorMessage: null,
        retryNonce: state.retryNonce + 1,
        hasToken: false,
      };
    case 'success':
      return {
        ...state,
        errorMessage: null,
        hasToken: true,
      };
    case 'expired':
      return {
        ...state,
        hasToken: false,
      };
  }
}
