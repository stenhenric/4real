import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCurrentSession } from '../../../../src/app/auth-state.ts';
import type { AuthResponseDTO, SessionListItemDTO, UserDTO } from '../../../../src/types/api.ts';

const user: UserDTO = {
  id: 'user-1',
  username: 'sten',
  email: 'sten@example.test',
  balance: '0',
  elo: 300,
  isAdmin: false,
  stats: { wins: 0, losses: 0, draws: 0 },
  avatar: { preset: 'pencil-face-01', color: 'ink' },
};

const existingSession: SessionListItemDTO = {
  id: 'session-old',
  deviceId: 'device-old',
  current: true,
  userAgent: 'old browser',
  ipAddress: '127.0.0.1',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  idleExpiresAt: '2026-01-02T00:00:00.000Z',
  absoluteExpiresAt: '2026-02-01T00:00:00.000Z',
};

const replacementSession: SessionListItemDTO = {
  ...existingSession,
  id: 'session-new',
  deviceId: 'device-new',
};

describe('resolveCurrentSession', () => {
  it('preserves the existing session when an authenticated response omits session', () => {
    const response: AuthResponseDTO = { status: 'requires_mfa', user };

    assert.equal(resolveCurrentSession(existingSession, response), existingSession);
  });

  it('clears the existing session when an authenticated response explicitly returns session null', () => {
    const response = { status: 'authenticated', user, session: null } satisfies AuthResponseDTO;

    assert.equal(resolveCurrentSession(existingSession, response), null);
  });

  it('replaces the existing session when a new session is returned', () => {
    const response: AuthResponseDTO = {
      status: 'authenticated',
      user,
      session: replacementSession,
    };

    assert.equal(resolveCurrentSession(existingSession, response), replacementSession);
  });

  it('clears the session for anonymous responses', () => {
    assert.equal(resolveCurrentSession(existingSession, null), null);
    assert.equal(resolveCurrentSession(existingSession, { status: 'logged_out' }), null);
  });
});
