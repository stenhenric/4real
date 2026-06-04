import type {
  MerchantDepositReplayResultDTO,
  MerchantDepositReviewItemDTO,
} from '../../types/api';

export type DepositStatusFilter = 'open' | 'resolved';
export type ReplayMode = 'dry-run' | 'apply';

export interface DepositsState {
  statusFilter: DepositStatusFilter;
  deposits: MerchantDepositReviewItemDTO[];
  loading: boolean;
  rowAction: string | null;
  replayResult: MerchantDepositReplayResultDTO | null;
  replayBusy: ReplayMode | null;
  windowStart: string;
  windowEnd: string;
}

export type DepositsAction =
  | { type: 'FILTER_CHANGED'; statusFilter: DepositStatusFilter }
  | { type: 'LOAD_STARTED' }
  | { type: 'LOAD_SUCCEEDED'; deposits: MerchantDepositReviewItemDTO[] }
  | { type: 'LOAD_FAILED' }
  | { type: 'ROW_ACTION_STARTED'; rowAction: string }
  | { type: 'ROW_ACTION_FINISHED' }
  | { type: 'REPLAY_WINDOW_CHANGED'; field: 'windowStart' | 'windowEnd'; value: string }
  | { type: 'REPLAY_STARTED'; mode: ReplayMode }
  | { type: 'REPLAY_SUCCEEDED'; result: MerchantDepositReplayResultDTO }
  | { type: 'REPLAY_FAILED' };

export function createInitialDepositsState(windowStart = '', windowEnd = ''): DepositsState {
  return {
    statusFilter: 'open',
    deposits: [],
    loading: true,
    rowAction: null,
    replayResult: null,
    replayBusy: null,
    windowStart,
    windowEnd,
  };
}

export function depositsReducer(state: DepositsState, action: DepositsAction): DepositsState {
  switch (action.type) {
    case 'FILTER_CHANGED':
      return {
        ...state,
        statusFilter: action.statusFilter,
      };
    case 'LOAD_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'LOAD_SUCCEEDED':
      return {
        ...state,
        deposits: action.deposits,
        loading: false,
      };
    case 'LOAD_FAILED':
      return {
        ...state,
        loading: false,
      };
    case 'ROW_ACTION_STARTED':
      return {
        ...state,
        rowAction: action.rowAction,
      };
    case 'ROW_ACTION_FINISHED':
      return {
        ...state,
        rowAction: null,
      };
    case 'REPLAY_WINDOW_CHANGED':
      return {
        ...state,
        [action.field]: action.value,
      };
    case 'REPLAY_STARTED':
      return {
        ...state,
        replayBusy: action.mode,
      };
    case 'REPLAY_SUCCEEDED':
      return {
        ...state,
        replayResult: action.result,
        replayBusy: null,
      };
    case 'REPLAY_FAILED':
      return {
        ...state,
        replayBusy: null,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
