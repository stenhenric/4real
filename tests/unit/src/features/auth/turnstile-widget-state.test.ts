import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TURNSTILE_RECOVERY_MESSAGE,
  createInitialTurnstileWidgetState,
  reduceTurnstileWidgetState,
} from '../../../../../src/features/auth/turnstile-widget-state.ts';

describe('turnstile widget recovery state', () => {
  it('shows a visible recovery error after a script load failure', () => {
    const state = reduceTurnstileWidgetState(createInitialTurnstileWidgetState(), { type: 'script_failed' });

    assert.equal(state.errorMessage, TURNSTILE_RECOVERY_MESSAGE);
    assert.equal(state.retryNonce, 0);
  });

  it('retry clears the error and requests a remount', () => {
    const failed = reduceTurnstileWidgetState(createInitialTurnstileWidgetState(), { type: 'widget_failed' });
    const retrying = reduceTurnstileWidgetState(failed, { type: 'retry' });

    assert.equal(retrying.errorMessage, null);
    assert.equal(retrying.retryNonce, 1);
  });

  it('successful token generation clears the recovery error', () => {
    const failed = reduceTurnstileWidgetState(createInitialTurnstileWidgetState(), { type: 'script_failed' });
    const recovered = reduceTurnstileWidgetState(failed, { type: 'success' });

    assert.equal(recovered.errorMessage, null);
  });

  it('keeps submission blocked until a token exists', () => {
    const failed = reduceTurnstileWidgetState(createInitialTurnstileWidgetState(), { type: 'script_failed' });

    assert.equal(failed.hasToken, false);
    assert.equal(reduceTurnstileWidgetState(failed, { type: 'success' }).hasToken, true);
    assert.equal(reduceTurnstileWidgetState(failed, { type: 'expired' }).hasToken, false);
  });
});
