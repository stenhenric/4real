import type { SessionListItemDTO } from '../../types/api';

export type SetupStep = 'intro' | 'scan' | 'confirm' | 'recovery';

export type ConfirmSessionAction =
  | { type: 'current'; session?: SessionListItemDTO | null }
  | { type: 'other'; session: SessionListItemDTO }
  | { type: 'others' };

export interface TotpSetupState {
  setupToken: string;
  totpSecret: string;
  otpauthUrl: string;
}

export interface MfaSettingsState {
  setupBusy: boolean;
  verifyBusy: boolean;
  disableBusy: boolean;
  recoveryBusy: boolean;
  setupStep: SetupStep;
  setup: TotpSetupState | null;
  qrCodeDataUrl: string;
  setupKeyRevealed: boolean;
  setupCode: string;
  disableCode: string;
  disableRecoveryCode: string;
  recoveryCodes: string[];
  recoveryConfirmOpen: boolean;
  mfaErrorMessage: string | null;
}

export type MfaSettingsAction =
  | { type: 'SETUP_STARTED' }
  | { type: 'SETUP_READY'; setup: TotpSetupState }
  | { type: 'SETUP_FAILED'; message: string }
  | { type: 'QR_RENDER_STARTED' }
  | { type: 'QR_READY'; dataUrl: string }
  | { type: 'QR_FAILED'; message: string }
  | { type: 'CODE_CHANGED'; value: string }
  | { type: 'SETUP_STEP_CHANGED'; setupStep: SetupStep }
  | { type: 'SETUP_KEY_VISIBILITY_CHANGED'; revealed: boolean }
  | { type: 'VERIFY_STARTED' }
  | { type: 'VERIFY_SUCCEEDED'; recoveryCodes: string[] }
  | { type: 'VERIFY_FAILED'; message: string }
  | { type: 'RECOVERY_CONFIRM_OPENED' }
  | { type: 'RECOVERY_CONFIRM_CLOSED' }
  | { type: 'RECOVERY_CODES_CONFIRMED' }
  | { type: 'RECOVERY_REGENERATE_STARTED' }
  | { type: 'RECOVERY_REGENERATE_SUCCEEDED'; recoveryCodes: string[] }
  | { type: 'RECOVERY_REGENERATE_FAILED'; message?: string }
  | { type: 'DISABLE_CODE_CHANGED'; value: string }
  | { type: 'DISABLE_RECOVERY_CODE_CHANGED'; value: string }
  | { type: 'DISABLE_STARTED' }
  | { type: 'DISABLE_SUCCEEDED' }
  | { type: 'DISABLE_FAILED'; message?: string }
  | { type: 'RESET_FLOW' };

export interface SessionSettingsState {
  sessions: SessionListItemDTO[];
  sessionsLoading: boolean;
  sessionAction: string | null;
  confirmSessionAction: ConfirmSessionAction | null;
}

export type SessionSettingsAction =
  | { type: 'SESSIONS_LOAD_STARTED' }
  | { type: 'SESSIONS_LOAD_SUCCEEDED'; sessions: SessionListItemDTO[] }
  | { type: 'SESSIONS_LOAD_FAILED' }
  | { type: 'SESSION_CONFIRM_OPENED'; action: ConfirmSessionAction }
  | { type: 'SESSION_CONFIRM_CLOSED' }
  | { type: 'SESSION_ACTION_STARTED'; actionId: string }
  | { type: 'SESSION_ACTION_SUCCEEDED'; sessions?: SessionListItemDTO[] }
  | { type: 'SESSION_ACTION_FAILED' };

export function createInitialMfaSettingsState(): MfaSettingsState {
  return {
    setupBusy: false,
    verifyBusy: false,
    disableBusy: false,
    recoveryBusy: false,
    setupStep: 'intro',
    setup: null,
    qrCodeDataUrl: '',
    setupKeyRevealed: false,
    setupCode: '',
    disableCode: '',
    disableRecoveryCode: '',
    recoveryCodes: [],
    recoveryConfirmOpen: false,
    mfaErrorMessage: null,
  };
}

export function createInitialSessionSettingsState(): SessionSettingsState {
  return {
    sessions: [],
    sessionsLoading: true,
    sessionAction: null,
    confirmSessionAction: null,
  };
}

function sanitizeTotpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function mfaSettingsReducer(
  state: MfaSettingsState,
  action: MfaSettingsAction,
): MfaSettingsState {
  switch (action.type) {
    case 'SETUP_STARTED':
      return {
        ...state,
        setupBusy: true,
        mfaErrorMessage: null,
      };
    case 'SETUP_READY':
      return {
        ...state,
        setupBusy: false,
        setup: action.setup,
        setupCode: '',
        setupKeyRevealed: false,
        setupStep: 'scan',
      };
    case 'SETUP_FAILED':
      return {
        ...state,
        setupBusy: false,
        mfaErrorMessage: action.message,
      };
    case 'QR_RENDER_STARTED':
      return {
        ...state,
        qrCodeDataUrl: '',
      };
    case 'QR_READY':
      return {
        ...state,
        qrCodeDataUrl: action.dataUrl,
      };
    case 'QR_FAILED':
      return {
        ...state,
        mfaErrorMessage: action.message,
      };
    case 'CODE_CHANGED':
      return {
        ...state,
        setupCode: sanitizeTotpCode(action.value),
        mfaErrorMessage: null,
      };
    case 'SETUP_STEP_CHANGED':
      return {
        ...state,
        setupStep: action.setupStep,
      };
    case 'SETUP_KEY_VISIBILITY_CHANGED':
      return {
        ...state,
        setupKeyRevealed: action.revealed,
      };
    case 'VERIFY_STARTED':
      return {
        ...state,
        verifyBusy: true,
        mfaErrorMessage: null,
      };
    case 'VERIFY_SUCCEEDED':
      return {
        ...state,
        verifyBusy: false,
        recoveryCodes: action.recoveryCodes,
        setup: null,
        setupCode: '',
        qrCodeDataUrl: '',
        setupKeyRevealed: false,
        setupStep: 'recovery',
        mfaErrorMessage: null,
      };
    case 'VERIFY_FAILED':
      return {
        ...state,
        verifyBusy: false,
        mfaErrorMessage: action.message,
      };
    case 'RECOVERY_CONFIRM_OPENED':
      return {
        ...state,
        recoveryConfirmOpen: true,
      };
    case 'RECOVERY_CONFIRM_CLOSED':
      return {
        ...state,
        recoveryConfirmOpen: false,
      };
    case 'RECOVERY_CODES_CONFIRMED':
      return {
        ...state,
        recoveryConfirmOpen: false,
        recoveryCodes: [],
        setupStep: 'intro',
      };
    case 'RECOVERY_REGENERATE_STARTED':
      return {
        ...state,
        recoveryBusy: true,
        mfaErrorMessage: null,
      };
    case 'RECOVERY_REGENERATE_SUCCEEDED':
      return {
        ...state,
        recoveryBusy: false,
        recoveryCodes: action.recoveryCodes,
        setupStep: 'recovery',
      };
    case 'RECOVERY_REGENERATE_FAILED':
      return {
        ...state,
        recoveryBusy: false,
        mfaErrorMessage: action.message ?? state.mfaErrorMessage,
      };
    case 'DISABLE_CODE_CHANGED':
      return {
        ...state,
        disableCode: sanitizeTotpCode(action.value),
      };
    case 'DISABLE_RECOVERY_CODE_CHANGED':
      return {
        ...state,
        disableRecoveryCode: action.value,
      };
    case 'DISABLE_STARTED':
      return {
        ...state,
        disableBusy: true,
        mfaErrorMessage: null,
      };
    case 'DISABLE_SUCCEEDED':
      return {
        ...state,
        disableBusy: false,
        recoveryCodes: [],
        disableCode: '',
        disableRecoveryCode: '',
        mfaErrorMessage: null,
      };
    case 'DISABLE_FAILED':
      return {
        ...state,
        disableBusy: false,
        mfaErrorMessage: action.message ?? state.mfaErrorMessage,
      };
    case 'RESET_FLOW':
      return createInitialMfaSettingsState();
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function sessionSettingsReducer(
  state: SessionSettingsState,
  action: SessionSettingsAction,
): SessionSettingsState {
  switch (action.type) {
    case 'SESSIONS_LOAD_STARTED':
      return {
        ...state,
        sessionsLoading: true,
      };
    case 'SESSIONS_LOAD_SUCCEEDED':
      return {
        ...state,
        sessions: action.sessions,
        sessionsLoading: false,
      };
    case 'SESSIONS_LOAD_FAILED':
      return {
        ...state,
        sessionsLoading: false,
      };
    case 'SESSION_CONFIRM_OPENED':
      return {
        ...state,
        confirmSessionAction: action.action,
      };
    case 'SESSION_CONFIRM_CLOSED':
      return {
        ...state,
        confirmSessionAction: null,
      };
    case 'SESSION_ACTION_STARTED':
      return {
        ...state,
        sessionAction: action.actionId,
      };
    case 'SESSION_ACTION_SUCCEEDED':
      return {
        ...state,
        sessions: action.sessions ?? state.sessions,
        sessionAction: null,
        confirmSessionAction: null,
      };
    case 'SESSION_ACTION_FAILED':
      return {
        ...state,
        sessionAction: null,
        confirmSessionAction: null,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
