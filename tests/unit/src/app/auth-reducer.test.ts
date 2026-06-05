import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  authReducer,
  createInitialAuthState,
  mapAuthUser,
  normalizeAuthStatus,
} from '../../../../src/app/authReducer.ts';
import type { AuthResponseDTO, SessionListItemDTO, UserDTO } from '../../../../src/types/api.ts';

const user: UserDTO = {
  id: 'user-1',
  username: 'player',
  email: 'player@example.com',
  balance: '10.000000',
  elo: 1200,
  isAdmin: false,
  stats: { wins: 1, losses: 2, draws: 3 },
  avatar: { preset: 'pencil-face-01', color: 'ink' },
};

const session: SessionListItemDTO = {
  id: 'session-1',
  deviceId: 'device-1',
  current: true,
  userAgent: 'Test Browser',
  ipAddress: '127.0.0.1',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:01:00.000Z',
  idleExpiresAt: '2026-01-02T00:00:00.000Z',
  absoluteExpiresAt: '2026-02-01T00:00:00.000Z',
};

describe('authReducer', () => {
  it('starts anonymous and loading', () => {
    assert.deepEqual(createInitialAuthState(), {
      user: null,
      userData: null,
      currentSession: null,
      authStatus: 'anonymous',
      loading: true,
    });
  });

  it('maps user data and normalizes authenticated responses', () => {
    assert.deepEqual(mapAuthUser(user), { id: 'user-1', email: 'player@example.com' });
    assert.equal(normalizeAuthStatus({ status: 'success', user }), 'authenticated');
  });

  it('keeps incomplete profiles out of authenticated status', () => {
    const incomplete = { ...user, username: '   ' };
    assert.equal(normalizeAuthStatus({ status: 'success', user: incomplete }), 'profile_incomplete');
    assert.equal(normalizeAuthStatus({ status: 'profile_incomplete', user }), 'profile_incomplete');
  });

  it('applies auth responses and preserves previous session when response omits one', () => {
    const response: AuthResponseDTO = { status: 'success', user, session };
    const authenticated = authReducer(createInitialAuthState(), {
      type: 'AUTH_RESPONSE_APPLIED',
      response,
    });
    assert.deepEqual(authenticated.user, { id: 'user-1', email: 'player@example.com' });
    assert.equal(authenticated.userData, user);
    assert.equal(authenticated.currentSession, session);
    assert.equal(authenticated.authStatus, 'authenticated');
    assert.equal(authenticated.loading, false);

    const nextUser = { ...user, balance: '12.000000' };
    const refreshed = authReducer(authenticated, {
      type: 'REFRESH_SUCCEEDED',
      response: { status: 'success', user: nextUser },
    });
    assert.equal(refreshed.userData, nextUser);
    assert.equal(refreshed.currentSession, session);
  });

  it('clears auth on null responses and clear actions', () => {
    const authenticated = authReducer(createInitialAuthState(), {
      type: 'AUTH_RESPONSE_APPLIED',
      response: { status: 'success', user, session },
    });

    assert.deepEqual(authReducer(authenticated, { type: 'AUTH_RESPONSE_APPLIED', response: null }), {
      user: null,
      userData: null,
      currentSession: null,
      authStatus: 'anonymous',
      loading: false,
    });

    assert.deepEqual(authReducer(authenticated, { type: 'AUTH_CLEARED' }), {
      user: null,
      userData: null,
      currentSession: null,
      authStatus: 'anonymous',
      loading: false,
    });
  });

  it('models refresh loading and failure transitions', () => {
    const loading = authReducer(createInitialAuthState(), { type: 'REFRESH_STARTED' });
    assert.equal(loading.loading, true);

    assert.equal(authReducer(loading, { type: 'REFRESH_FAILED' }).loading, false);
    assert.deepEqual(authReducer(loading, { type: 'REFRESH_FAILED', clearAuth: true }), {
      user: null,
      userData: null,
      currentSession: null,
      authStatus: 'anonymous',
      loading: false,
    });
    assert.equal(authReducer(loading, { type: 'LOADING_FINISHED' }).loading, false);
  });
});
