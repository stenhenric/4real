import type { MerchantDashboardDTO } from '../../types/api';

export type MerchantDashboardStatus = 'loading' | 'ready' | 'error';

export interface MerchantDashboardState {
  dashboard: MerchantDashboardDTO | null;
  status: MerchantDashboardStatus;
  isRefreshing: boolean;
  error: string | null;
}

export type MerchantDashboardAction =
  | { type: 'INITIAL_LOAD_STARTED' }
  | { type: 'REFRESH_STARTED' }
  | { type: 'POLL_STARTED' }
  | { type: 'LOAD_SUCCEEDED'; dashboard: MerchantDashboardDTO }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'LOAD_ABORTED' };

export function createInitialMerchantDashboardState(): MerchantDashboardState {
  return {
    dashboard: null,
    status: 'loading',
    isRefreshing: false,
    error: null,
  };
}

export function merchantDashboardReducer(
  state: MerchantDashboardState,
  action: MerchantDashboardAction,
): MerchantDashboardState {
  switch (action.type) {
    case 'INITIAL_LOAD_STARTED':
      return {
        ...state,
        status: state.status === 'ready' ? state.status : 'loading',
        error: null,
      };
    case 'REFRESH_STARTED':
    case 'POLL_STARTED':
      return {
        ...state,
        isRefreshing: true,
      };
    case 'LOAD_SUCCEEDED':
      return {
        dashboard: action.dashboard,
        status: 'ready',
        isRefreshing: false,
        error: null,
      };
    case 'LOAD_FAILED':
      return {
        ...state,
        isRefreshing: false,
        error: action.message,
        status: state.dashboard ? state.status : 'error',
      };
    case 'LOAD_ABORTED':
      return {
        ...state,
        isRefreshing: false,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
