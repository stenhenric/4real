import type { WithdrawalRequestAcceptedDTO, WithdrawalStatusDTO } from '../../types/api';

export type WithdrawStep = 'form' | 'review' | 'status';

export interface WithdrawalFieldErrors {
  amount?: string;
  toAddress?: string;
}

export interface WithdrawalFlowState {
  step: WithdrawStep;
  amount: string;
  toAddress: string;
  fieldErrors: WithdrawalFieldErrors;
  reviewAmount: string | null;
  loading: boolean;
  acceptedWithdrawal: WithdrawalRequestAcceptedDTO | null;
  withdrawalStatus: WithdrawalStatusDTO | null;
  statusError: string | null;
}

export type WithdrawalFlowAction =
  | { type: 'CONNECTED_WALLET_PREFILLED'; toAddress: string }
  | { type: 'FIELD_CHANGED'; field: 'amount' | 'toAddress'; value: string }
  | { type: 'VALIDATION_FAILED'; fieldErrors: WithdrawalFieldErrors }
  | { type: 'REVIEW_READY'; amountUsdt: string }
  | { type: 'SUBMIT_STARTED' }
  | {
      type: 'SUBMIT_ACCEPTED';
      acceptedWithdrawal: WithdrawalRequestAcceptedDTO;
      withdrawalStatus: WithdrawalStatusDTO;
    }
  | { type: 'SUBMIT_FAILED' }
  | { type: 'STATUS_RECEIVED'; withdrawalStatus: WithdrawalStatusDTO }
  | { type: 'STATUS_FAILED'; message: string }
  | { type: 'MFA_RESUME_READY'; amountUsdt: string; toAddress: string; step: WithdrawStep }
  | { type: 'MFA_FAILED'; message: string; amountUsdt?: string; toAddress?: string; step?: WithdrawStep }
  | { type: 'MFA_CANCELLED'; message: string; amountUsdt?: string; toAddress?: string; step?: WithdrawStep }
  | { type: 'RESET_TO_FORM'; statusError?: string };

export function createInitialWithdrawalFlowState(): WithdrawalFlowState {
  return {
    step: 'form',
    amount: '',
    toAddress: '',
    fieldErrors: {},
    reviewAmount: null,
    loading: false,
    acceptedWithdrawal: null,
    withdrawalStatus: null,
    statusError: null,
  };
}

export function withdrawalFlowReducer(
  state: WithdrawalFlowState,
  action: WithdrawalFlowAction,
): WithdrawalFlowState {
  switch (action.type) {
    case 'CONNECTED_WALLET_PREFILLED':
      if (state.step !== 'form' || state.toAddress.trim().length > 0) {
        return state;
      }
      return {
        ...state,
        toAddress: action.toAddress,
      };
    case 'FIELD_CHANGED': {
      const nextErrors = { ...state.fieldErrors };
      delete nextErrors[action.field];

      return {
        ...state,
        [action.field]: action.value,
        step: 'form',
        fieldErrors: nextErrors,
        reviewAmount: null,
        acceptedWithdrawal: null,
        withdrawalStatus: null,
        statusError: null,
      };
    }
    case 'VALIDATION_FAILED':
      return {
        ...state,
        step: 'form',
        fieldErrors: action.fieldErrors,
      };
    case 'REVIEW_READY':
      return {
        ...state,
        step: 'review',
        fieldErrors: {},
        reviewAmount: action.amountUsdt,
        statusError: null,
      };
    case 'SUBMIT_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'SUBMIT_ACCEPTED':
      return {
        ...state,
        step: 'status',
        loading: false,
        acceptedWithdrawal: action.acceptedWithdrawal,
        withdrawalStatus: action.withdrawalStatus,
        statusError: null,
      };
    case 'SUBMIT_FAILED':
      return {
        ...state,
        loading: false,
      };
    case 'STATUS_RECEIVED':
      return {
        ...state,
        withdrawalStatus: action.withdrawalStatus,
        statusError: null,
      };
    case 'STATUS_FAILED':
      return {
        ...state,
        statusError: action.message,
      };
    case 'MFA_RESUME_READY':
      return {
        ...state,
        amount: action.amountUsdt,
        toAddress: action.toAddress,
        reviewAmount: action.amountUsdt,
        step: action.step,
        statusError: null,
      };
    case 'MFA_FAILED':
    case 'MFA_CANCELLED':
      return {
        ...state,
        amount: action.amountUsdt ?? state.amount,
        toAddress: action.toAddress ?? state.toAddress,
        reviewAmount: action.amountUsdt ?? state.reviewAmount,
        step: action.step ?? state.step,
        statusError: action.message,
      };
    case 'RESET_TO_FORM':
      return {
        ...state,
        step: 'form',
        fieldErrors: {},
        reviewAmount: null,
        loading: false,
        acceptedWithdrawal: null,
        withdrawalStatus: null,
        statusError: action.statusError ?? state.statusError,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
