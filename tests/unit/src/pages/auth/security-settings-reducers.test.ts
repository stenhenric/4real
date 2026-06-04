import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialMfaSettingsState,
  createInitialSessionSettingsState,
  mfaSettingsReducer,
  sessionSettingsReducer,
  type ConfirmSessionAction,
  type TotpSetupState,
} from '../../../../../src/pages/auth/securitySettingsReducers.ts';
import type { SessionListItemDTO } from '../../../../../src/types/api.ts';

const setup: TotpSetupState = {
  setupToken: 'setup-token',
  totpSecret: 'secret',
  otpauthUrl: 'otpauth://totp/4REAL',
};

function session(id: string, current = false): SessionListItemDTO {
  return {
    id,
    deviceId: `device-${id}`,
    current,
    userAgent: 'Test Browser',
    ipAddress: '127.0.0.1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:01:00.000Z',
    idleExpiresAt: '2026-01-02T00:00:00.000Z',
    absoluteExpiresAt: '2026-02-01T00:00:00.000Z',
  };
}

describe('mfaSettingsReducer', () => {
  it('starts with explicit idle MFA setup state', () => {
    assert.deepEqual(createInitialMfaSettingsState(), {
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
    });
  });

  it('models setup start, success, QR rendering, and setup step changes', () => {
    const started = mfaSettingsReducer(createInitialMfaSettingsState(), { type: 'SETUP_STARTED' });
    assert.equal(started.setupBusy, true);
    assert.equal(started.mfaErrorMessage, null);

    const ready = mfaSettingsReducer(started, { type: 'SETUP_READY', setup });
    assert.equal(ready.setupBusy, false);
    assert.deepEqual(ready.setup, setup);
    assert.equal(ready.setupStep, 'scan');

    const rendering = mfaSettingsReducer(ready, { type: 'QR_RENDER_STARTED' });
    assert.equal(rendering.qrCodeDataUrl, '');
    assert.equal(mfaSettingsReducer(rendering, { type: 'QR_READY', dataUrl: 'data:image/png;base64,abc' }).qrCodeDataUrl, 'data:image/png;base64,abc');

    const failed = mfaSettingsReducer(rendering, {
      type: 'QR_FAILED',
      message: 'Could not render the QR code.',
    });
    assert.equal(failed.mfaErrorMessage, 'Could not render the QR code.');

    assert.equal(
      mfaSettingsReducer(failed, { type: 'SETUP_STEP_CHANGED', setupStep: 'confirm' }).setupStep,
      'confirm',
    );
  });

  it('sanitizes setup codes and handles verify success and failure', () => {
    const withCode = mfaSettingsReducer(createInitialMfaSettingsState(), {
      type: 'CODE_CHANGED',
      value: '12a34567',
    });
    assert.equal(withCode.setupCode, '123456');

    const verifying = mfaSettingsReducer(withCode, { type: 'VERIFY_STARTED' });
    assert.equal(verifying.verifyBusy, true);

    const failed = mfaSettingsReducer(verifying, {
      type: 'VERIFY_FAILED',
      message: 'Invalid code.',
    });
    assert.equal(failed.verifyBusy, false);
    assert.equal(failed.mfaErrorMessage, 'Invalid code.');

    const succeeded = mfaSettingsReducer(verifying, {
      type: 'VERIFY_SUCCEEDED',
      recoveryCodes: ['one', 'two'],
    });
    assert.equal(succeeded.verifyBusy, false);
    assert.equal(succeeded.setup, null);
    assert.equal(succeeded.setupCode, '');
    assert.equal(succeeded.setupStep, 'recovery');
    assert.deepEqual(succeeded.recoveryCodes, ['one', 'two']);
  });

  it('models recovery confirmation and regeneration transitions', () => {
    const opened = mfaSettingsReducer(createInitialMfaSettingsState(), { type: 'RECOVERY_CONFIRM_OPENED' });
    assert.equal(opened.recoveryConfirmOpen, true);
    assert.equal(mfaSettingsReducer(opened, { type: 'RECOVERY_CONFIRM_CLOSED' }).recoveryConfirmOpen, false);

    const confirmed = mfaSettingsReducer(
      { ...opened, recoveryCodes: ['one'], setupStep: 'recovery' },
      { type: 'RECOVERY_CODES_CONFIRMED' },
    );
    assert.equal(confirmed.recoveryConfirmOpen, false);
    assert.deepEqual(confirmed.recoveryCodes, []);
    assert.equal(confirmed.setupStep, 'intro');

    const regenerating = mfaSettingsReducer(confirmed, { type: 'RECOVERY_REGENERATE_STARTED' });
    assert.equal(regenerating.recoveryBusy, true);
    const regenerated = mfaSettingsReducer(regenerating, {
      type: 'RECOVERY_REGENERATE_SUCCEEDED',
      recoveryCodes: ['new'],
    });
    assert.equal(regenerated.recoveryBusy, false);
    assert.equal(regenerated.setupStep, 'recovery');
    assert.deepEqual(regenerated.recoveryCodes, ['new']);
  });

  it('models disable validation, input changes, success, and reset', () => {
    let state = mfaSettingsReducer(createInitialMfaSettingsState(), {
      type: 'DISABLE_CODE_CHANGED',
      value: '12x34567',
    });
    state = mfaSettingsReducer(state, {
      type: 'DISABLE_RECOVERY_CODE_CHANGED',
      value: 'recovery-code',
    });
    assert.equal(state.disableCode, '123456');
    assert.equal(state.disableRecoveryCode, 'recovery-code');

    const busy = mfaSettingsReducer(state, { type: 'DISABLE_STARTED' });
    assert.equal(busy.disableBusy, true);

    const failed = mfaSettingsReducer(busy, {
      type: 'DISABLE_FAILED',
      message: 'Provide either code or recovery code.',
    });
    assert.equal(failed.disableBusy, false);
    assert.equal(failed.mfaErrorMessage, 'Provide either code or recovery code.');

    const succeeded = mfaSettingsReducer(busy, { type: 'DISABLE_SUCCEEDED' });
    assert.equal(succeeded.disableBusy, false);
    assert.equal(succeeded.disableCode, '');
    assert.equal(succeeded.disableRecoveryCode, '');

    assert.deepEqual(mfaSettingsReducer(succeeded, { type: 'RESET_FLOW' }), createInitialMfaSettingsState());
  });
});

describe('sessionSettingsReducer', () => {
  it('starts with sessions loading and no active confirmation', () => {
    assert.deepEqual(createInitialSessionSettingsState(), {
      sessions: [],
      sessionsLoading: true,
      sessionAction: null,
      confirmSessionAction: null,
    });
  });

  it('models session load success and failure', () => {
    const loading = sessionSettingsReducer(createInitialSessionSettingsState(), { type: 'SESSIONS_LOAD_STARTED' });
    assert.equal(loading.sessionsLoading, true);

    const loaded = sessionSettingsReducer(loading, {
      type: 'SESSIONS_LOAD_SUCCEEDED',
      sessions: [session('current', true)],
    });
    assert.equal(loaded.sessionsLoading, false);
    assert.equal(loaded.sessions.length, 1);

    assert.equal(
      sessionSettingsReducer(loading, { type: 'SESSIONS_LOAD_FAILED' }).sessionsLoading,
      false,
    );
  });

  it('tracks confirmation modal state separately from active action state', () => {
    const confirmAction: ConfirmSessionAction = { type: 'other', session: session('other') };
    const opened = sessionSettingsReducer(createInitialSessionSettingsState(), {
      type: 'SESSION_CONFIRM_OPENED',
      action: confirmAction,
    });
    assert.deepEqual(opened.confirmSessionAction, confirmAction);

    assert.equal(
      sessionSettingsReducer(opened, { type: 'SESSION_CONFIRM_CLOSED' }).confirmSessionAction,
      null,
    );
  });

  it('models session action start, success, and failure', () => {
    const current = session('current', true);
    const other = session('other');
    const loaded = sessionSettingsReducer(createInitialSessionSettingsState(), {
      type: 'SESSIONS_LOAD_SUCCEEDED',
      sessions: [current, other],
    });
    const started = sessionSettingsReducer(loaded, { type: 'SESSION_ACTION_STARTED', actionId: other.id });
    assert.equal(started.sessionAction, other.id);

    const succeeded = sessionSettingsReducer(started, {
      type: 'SESSION_ACTION_SUCCEEDED',
      sessions: [current],
    });
    assert.equal(succeeded.sessionAction, null);
    assert.equal(succeeded.confirmSessionAction, null);
    assert.deepEqual(succeeded.sessions, [current]);

    const failed = sessionSettingsReducer(started, { type: 'SESSION_ACTION_FAILED' });
    assert.equal(failed.sessionAction, null);
    assert.equal(failed.confirmSessionAction, null);
  });
});
