import type { MerchantOrderDeskResponseDTO, OrderDTO } from '../../types/api';

export type OrderTypeFilter = 'ALL' | 'BUY' | 'SELL';
export type OrderStatusFilter = 'ALL' | OrderDTO['status'];

export interface OrderDeskState {
  typeFilter: OrderTypeFilter;
  statusFilter: OrderStatusFilter;
  page: number;
  deskData: MerchantOrderDeskResponseDTO | null;
  loading: boolean;
  rowActions: Record<string, true>;
}

export type OrderDeskAction =
  | { type: 'TYPE_FILTER_CHANGED'; typeFilter: OrderTypeFilter }
  | { type: 'STATUS_FILTER_CHANGED'; statusFilter: OrderStatusFilter }
  | { type: 'PAGE_CHANGED'; page: number }
  | { type: 'LOAD_STARTED' }
  | { type: 'LOAD_SUCCEEDED'; deskData: MerchantOrderDeskResponseDTO }
  | { type: 'LOAD_FAILED' }
  | { type: 'ROW_ACTION_STARTED'; rowActionKey: string }
  | { type: 'ROW_ACTION_FINISHED'; rowActionKey: string };

export function createInitialOrderDeskState(): OrderDeskState {
  return {
    typeFilter: 'ALL',
    statusFilter: 'PENDING',
    page: 1,
    deskData: null,
    loading: true,
    rowActions: {},
  };
}

export function orderDeskReducer(state: OrderDeskState, action: OrderDeskAction): OrderDeskState {
  switch (action.type) {
    case 'TYPE_FILTER_CHANGED':
      return {
        ...state,
        typeFilter: action.typeFilter,
        page: 1,
      };
    case 'STATUS_FILTER_CHANGED':
      return {
        ...state,
        statusFilter: action.statusFilter,
        page: 1,
      };
    case 'PAGE_CHANGED':
      return {
        ...state,
        page: action.page,
      };
    case 'LOAD_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'LOAD_SUCCEEDED':
      return {
        ...state,
        deskData: action.deskData,
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
        rowActions: {
          ...state.rowActions,
          [action.rowActionKey]: true,
        },
      };
    case 'ROW_ACTION_FINISHED': {
      const { [action.rowActionKey]: _finishedAction, ...remaining } = state.rowActions;
      return {
        ...state,
        rowActions: remaining,
      };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
