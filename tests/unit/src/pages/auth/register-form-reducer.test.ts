import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialRegisterFormState,
  registerFormReducer,
} from '../../../../../src/pages/auth/registerFormReducer.ts';

describe('registerFormReducer', () => {
  it('starts on account details with empty form fields', () => {
    assert.deepEqual(createInitialRegisterFormState(), {
      step: 'account_details',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      loading: false,
      googleLoading: false,
      usernameError: undefined,
      turnstileToken: undefined,
    });
  });

  it('updates fields and clears username errors when username changes', () => {
    const rejected = registerFormReducer(createInitialRegisterFormState(), {
      type: 'USERNAME_REJECTED',
      message: 'That username is already taken.',
    });
    const edited = registerFormReducer(rejected, {
      type: 'FIELD_CHANGED',
      field: 'username',
      value: 'new-name',
    });

    assert.equal(edited.username, 'new-name');
    assert.equal(edited.usernameError, undefined);
  });

  it('moves between details and verification without erasing entered fields', () => {
    let state = registerFormReducer(createInitialRegisterFormState(), {
      type: 'FIELD_CHANGED',
      field: 'email',
      value: 'player@example.com',
    });
    state = registerFormReducer(state, { type: 'DETAILS_ACCEPTED' });
    assert.equal(state.step, 'verification');

    const reset = registerFormReducer(state, { type: 'RESET_TO_DETAILS' });
    assert.equal(reset.step, 'account_details');
    assert.equal(reset.email, 'player@example.com');
  });

  it('models Turnstile, submit, username rejection, and generic failure transitions', () => {
    const tokened = registerFormReducer(createInitialRegisterFormState(), {
      type: 'TURNSTILE_PASSED',
      token: 'token',
    });
    assert.equal(tokened.turnstileToken, 'token');

    const submitting = registerFormReducer(tokened, { type: 'SUBMIT_STARTED' });
    assert.equal(submitting.loading, true);

    const rejected = registerFormReducer(submitting, {
      type: 'USERNAME_REJECTED',
      message: 'That username is already taken.',
    });
    assert.equal(rejected.step, 'account_details');
    assert.equal(rejected.loading, false);
    assert.equal(rejected.turnstileToken, undefined);

    const failed = registerFormReducer(submitting, { type: 'SUBMIT_FAILED', resetTurnstile: true });
    assert.equal(failed.loading, false);
    assert.equal(failed.turnstileToken, undefined);
  });

  it('models Google start and failure', () => {
    const started = registerFormReducer(createInitialRegisterFormState(), { type: 'GOOGLE_STARTED' });
    assert.equal(started.googleLoading, true);
    assert.equal(registerFormReducer(started, { type: 'GOOGLE_FAILED' }).googleLoading, false);
  });
});
