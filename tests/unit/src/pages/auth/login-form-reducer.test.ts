import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialLoginFormState,
  loginFormReducer,
} from '../../../../../src/pages/auth/loginFormReducer.ts';

describe('loginFormReducer', () => {
  it('starts at method selection with no pending submissions', () => {
    assert.deepEqual(createInitialLoginFormState(), {
      step: 'method_selection',
      identifier: '',
      password: '',
      passwordLoading: false,
      magicLoading: false,
      googleLoading: false,
      turnstileToken: undefined,
    });
  });

  it('tracks identifier, password, selected method, and Turnstile token', () => {
    let state = loginFormReducer(createInitialLoginFormState(), {
      type: 'IDENTIFIER_CHANGED',
      value: 'player@example.com',
    });
    state = loginFormReducer(state, { type: 'PASSWORD_CHANGED', value: 'secret' });
    state = loginFormReducer(state, { type: 'METHOD_SELECTED', step: 'password_entry' });
    state = loginFormReducer(state, { type: 'TURNSTILE_PASSED', token: 'token' });

    assert.equal(state.identifier, 'player@example.com');
    assert.equal(state.password, 'secret');
    assert.equal(state.step, 'password_entry');
    assert.equal(state.turnstileToken, 'token');
  });

  it('models password, magic-link, and Google loading states', () => {
    assert.equal(loginFormReducer(createInitialLoginFormState(), { type: 'PASSWORD_SUBMIT_STARTED' }).passwordLoading, true);
    assert.equal(loginFormReducer(createInitialLoginFormState(), { type: 'MAGIC_SUBMIT_STARTED' }).magicLoading, true);
    assert.equal(loginFormReducer(createInitialLoginFormState(), { type: 'GOOGLE_STARTED' }).googleLoading, true);
  });

  it('resets token and password on credential failure', () => {
    const withSecret = {
      ...createInitialLoginFormState(),
      password: 'bad-password',
      passwordLoading: true,
      turnstileToken: 'token',
    };
    const failed = loginFormReducer(withSecret, {
      type: 'SUBMIT_FAILED',
      clearPassword: true,
      resetTurnstile: true,
    });

    assert.equal(failed.password, '');
    assert.equal(failed.passwordLoading, false);
    assert.equal(failed.turnstileToken, undefined);
  });

  it('resets back to method selection without erasing the identifier', () => {
    const state = {
      ...createInitialLoginFormState(),
      step: 'magic_link_verification' as const,
      identifier: 'player@example.com',
      password: 'secret',
      turnstileToken: 'token',
    };
    const reset = loginFormReducer(state, { type: 'RESET_TO_METHODS' });

    assert.equal(reset.step, 'method_selection');
    assert.equal(reset.identifier, 'player@example.com');
    assert.equal(reset.password, '');
    assert.equal(reset.turnstileToken, undefined);
  });
});
