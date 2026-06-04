export type MerchantTab = 'buy' | 'sell';

export interface MerchantTradeState {
  activeTab: MerchantTab;
  amount: string;
  proofImage: File | null;
  transactionCode: string;
  paymentConfirmed: boolean;
  mpesaNumber: string;
  mpesaName: string;
  loading: boolean;
}

export type MerchantTradeAction =
  | { type: 'TAB_CHANGED'; tab: MerchantTab }
  | { type: 'AMOUNT_CHANGED'; value: string }
  | { type: 'BUY_PROOF_SELECTED'; proofImage: File | null }
  | { type: 'BUY_CODE_CHANGED'; value: string }
  | { type: 'SELL_DETAILS_CHANGED'; mpesaNumber?: string; mpesaName?: string }
  | { type: 'PAYMENT_CONFIRMED' }
  | { type: 'PAYMENT_UNCONFIRMED' }
  | { type: 'SUBMIT_STARTED' }
  | { type: 'SUBMIT_SUCCEEDED' }
  | { type: 'SUBMIT_FAILED' }
  | { type: 'RESET' };

export function createInitialMerchantTradeState(): MerchantTradeState {
  return {
    activeTab: 'buy',
    amount: '',
    proofImage: null,
    transactionCode: '',
    paymentConfirmed: false,
    mpesaNumber: '',
    mpesaName: '',
    loading: false,
  };
}

function resetTradeFields(state: MerchantTradeState): MerchantTradeState {
  return {
    ...state,
    amount: '',
    proofImage: null,
    transactionCode: '',
    paymentConfirmed: false,
    mpesaNumber: '',
    mpesaName: '',
  };
}

export function merchantTradeReducer(
  state: MerchantTradeState,
  action: MerchantTradeAction,
): MerchantTradeState {
  switch (action.type) {
    case 'TAB_CHANGED':
      return resetTradeFields({
        ...state,
        activeTab: action.tab,
      });
    case 'AMOUNT_CHANGED':
      return {
        ...state,
        amount: action.value,
        proofImage: null,
        transactionCode: '',
        paymentConfirmed: false,
      };
    case 'BUY_PROOF_SELECTED':
      return {
        ...state,
        proofImage: action.proofImage,
      };
    case 'BUY_CODE_CHANGED':
      return {
        ...state,
        transactionCode: action.value,
      };
    case 'SELL_DETAILS_CHANGED':
      return {
        ...state,
        mpesaNumber: action.mpesaNumber ?? state.mpesaNumber,
        mpesaName: action.mpesaName ?? state.mpesaName,
      };
    case 'PAYMENT_CONFIRMED':
      return {
        ...state,
        paymentConfirmed: true,
      };
    case 'PAYMENT_UNCONFIRMED':
      return {
        ...state,
        paymentConfirmed: false,
      };
    case 'SUBMIT_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'SUBMIT_SUCCEEDED':
      return {
        ...resetTradeFields(state),
        loading: false,
      };
    case 'SUBMIT_FAILED':
      return {
        ...state,
        loading: false,
      };
    case 'RESET':
      return resetTradeFields({
        ...state,
        loading: false,
      });
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
