import type { DepositMemoDTO } from '../../types/api';

export type DepositStep = 'amount' | 'review' | 'details' | 'pending';

export interface PaymentDetails {
  data: DepositMemoDTO;
  amountUsdt: string;
}

export interface DepositFlowState {
  step: DepositStep;
  depositAmount: string;
  amountError: string | null;
  reviewAmount: string | null;
  paymentDetails: PaymentDetails | null;
  loadingDetails: boolean;
  sendingTransaction: boolean;
}

export type DepositFlowAction =
  | { type: 'AMOUNT_CHANGED'; value: string }
  | { type: 'AMOUNT_INVALID'; message: string }
  | { type: 'REVIEW_READY'; amountUsdt: string }
  | { type: 'DETAILS_REQUESTED' }
  | { type: 'DETAILS_READY'; data: DepositMemoDTO; amountUsdt: string }
  | { type: 'DETAILS_FAILED' }
  | { type: 'TRANSACTION_STARTED' }
  | { type: 'TRANSACTION_SENT' }
  | { type: 'TRANSACTION_FAILED' }
  | { type: 'RESET_TO_AMOUNT' };

export function createInitialDepositFlowState(): DepositFlowState {
  return {
    step: 'amount',
    depositAmount: '',
    amountError: null,
    reviewAmount: null,
    paymentDetails: null,
    loadingDetails: false,
    sendingTransaction: false,
  };
}

export function depositFlowReducer(
  state: DepositFlowState,
  action: DepositFlowAction,
): DepositFlowState {
  switch (action.type) {
    case 'AMOUNT_CHANGED':
      return {
        ...state,
        step: 'amount',
        depositAmount: action.value,
        amountError: null,
        reviewAmount: null,
        paymentDetails: null,
        loadingDetails: false,
        sendingTransaction: false,
      };
    case 'AMOUNT_INVALID':
      return {
        ...state,
        step: 'amount',
        amountError: action.message,
        reviewAmount: null,
        paymentDetails: null,
      };
    case 'REVIEW_READY':
      return {
        ...state,
        step: 'review',
        amountError: null,
        reviewAmount: action.amountUsdt,
        paymentDetails: null,
        loadingDetails: false,
      };
    case 'DETAILS_REQUESTED':
      return {
        ...state,
        loadingDetails: true,
      };
    case 'DETAILS_READY':
      return {
        ...state,
        step: 'details',
        reviewAmount: action.amountUsdt,
        paymentDetails: {
          data: action.data,
          amountUsdt: action.amountUsdt,
        },
        loadingDetails: false,
      };
    case 'DETAILS_FAILED':
      return {
        ...state,
        loadingDetails: false,
      };
    case 'TRANSACTION_STARTED':
      return {
        ...state,
        sendingTransaction: true,
      };
    case 'TRANSACTION_SENT':
      return {
        ...state,
        step: 'pending',
        sendingTransaction: false,
      };
    case 'TRANSACTION_FAILED':
      return {
        ...state,
        sendingTransaction: false,
      };
    case 'RESET_TO_AMOUNT':
      return {
        ...state,
        step: 'amount',
        amountError: null,
        reviewAmount: null,
        paymentDetails: null,
        loadingDetails: false,
        sendingTransaction: false,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
