export type RegisterStep = 'account_details' | 'verification';

export interface RegisterFormState {
  step: RegisterStep;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  googleLoading: boolean;
  usernameError: string | undefined;
  turnstileToken: string | undefined;
}

export type RegisterFormAction =
  | { type: 'FIELD_CHANGED'; field: 'username' | 'email' | 'password' | 'confirmPassword'; value: string }
  | { type: 'DETAILS_ACCEPTED' }
  | { type: 'TURNSTILE_PASSED'; token: string }
  | { type: 'TURNSTILE_RESET' }
  | { type: 'SUBMIT_STARTED' }
  | { type: 'USERNAME_REJECTED'; message: string }
  | { type: 'SUBMIT_FAILED'; resetTurnstile?: boolean }
  | { type: 'GOOGLE_STARTED' }
  | { type: 'GOOGLE_FAILED' }
  | { type: 'RESET_TO_DETAILS' };

export function createInitialRegisterFormState(): RegisterFormState {
  return {
    step: 'account_details',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    loading: false,
    googleLoading: false,
    usernameError: undefined,
    turnstileToken: undefined,
  };
}

export function registerFormReducer(
  state: RegisterFormState,
  action: RegisterFormAction,
): RegisterFormState {
  switch (action.type) {
    case 'FIELD_CHANGED':
      return {
        ...state,
        [action.field]: action.value,
        usernameError: action.field === 'username' ? undefined : state.usernameError,
      };
    case 'DETAILS_ACCEPTED':
      return {
        ...state,
        step: 'verification',
      };
    case 'TURNSTILE_PASSED':
      return {
        ...state,
        turnstileToken: action.token,
      };
    case 'TURNSTILE_RESET':
      return {
        ...state,
        turnstileToken: undefined,
      };
    case 'SUBMIT_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'USERNAME_REJECTED':
      return {
        ...state,
        step: 'account_details',
        loading: false,
        usernameError: action.message,
        turnstileToken: undefined,
      };
    case 'SUBMIT_FAILED':
      return {
        ...state,
        loading: false,
        turnstileToken: action.resetTurnstile ? undefined : state.turnstileToken,
      };
    case 'GOOGLE_STARTED':
      return {
        ...state,
        googleLoading: true,
      };
    case 'GOOGLE_FAILED':
      return {
        ...state,
        googleLoading: false,
      };
    case 'RESET_TO_DETAILS':
      return {
        ...state,
        step: 'account_details',
        turnstileToken: undefined,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
