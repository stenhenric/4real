export type LoginStep = 'method_selection' | 'password_entry' | 'magic_link_verification';

export interface LoginFormState {
  step: LoginStep;
  identifier: string;
  password: string;
  passwordLoading: boolean;
  magicLoading: boolean;
  googleLoading: boolean;
  turnstileToken: string | undefined;
}

export type LoginFormAction =
  | { type: 'IDENTIFIER_CHANGED'; value: string }
  | { type: 'PASSWORD_CHANGED'; value: string }
  | { type: 'METHOD_SELECTED'; step: Exclude<LoginStep, 'method_selection'> }
  | { type: 'TURNSTILE_PASSED'; token: string }
  | { type: 'TURNSTILE_RESET' }
  | { type: 'PASSWORD_SUBMIT_STARTED' }
  | { type: 'MAGIC_SUBMIT_STARTED' }
  | { type: 'GOOGLE_STARTED' }
  | { type: 'SUBMIT_FAILED'; clearPassword?: boolean; resetTurnstile?: boolean }
  | { type: 'RESET_TO_METHODS' };

export function createInitialLoginFormState(): LoginFormState {
  return {
    step: 'method_selection',
    identifier: '',
    password: '',
    passwordLoading: false,
    magicLoading: false,
    googleLoading: false,
    turnstileToken: undefined,
  };
}

export function loginFormReducer(state: LoginFormState, action: LoginFormAction): LoginFormState {
  switch (action.type) {
    case 'IDENTIFIER_CHANGED':
      return {
        ...state,
        identifier: action.value,
      };
    case 'PASSWORD_CHANGED':
      return {
        ...state,
        password: action.value,
      };
    case 'METHOD_SELECTED':
      return {
        ...state,
        step: action.step,
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
    case 'PASSWORD_SUBMIT_STARTED':
      return {
        ...state,
        passwordLoading: true,
      };
    case 'MAGIC_SUBMIT_STARTED':
      return {
        ...state,
        magicLoading: true,
      };
    case 'GOOGLE_STARTED':
      return {
        ...state,
        googleLoading: true,
      };
    case 'SUBMIT_FAILED':
      return {
        ...state,
        password: action.clearPassword ? '' : state.password,
        passwordLoading: false,
        magicLoading: false,
        googleLoading: false,
        turnstileToken: action.resetTurnstile ? undefined : state.turnstileToken,
      };
    case 'RESET_TO_METHODS':
      return {
        ...state,
        step: 'method_selection',
        password: '',
        passwordLoading: false,
        magicLoading: false,
        turnstileToken: undefined,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
