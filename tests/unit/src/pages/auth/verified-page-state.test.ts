import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getVerifiedPageState,
  getVerifiedPostAuthResponse,
} from '../../../../../src/pages/auth/verified-page-state.ts';
import type { UserDTO } from '../../../../../src/types/api.ts';

const completeUser: UserDTO = {
  id: 'user-1',
  username: 'sten',
  email: 'sten@example.test',
  balance: '0',
  elo: 1000,
  isAdmin: false,
  stats: { wins: 0, losses: 0, draws: 0 },
};

describe('verified page state', () => {
  it('does not allow anonymous users to see the success state', () => {
    assert.equal(getVerifiedPageState({ loading: false, userData: null }), 'redirect_login');
  });

  it('allows authenticated users to see the success state', () => {
    assert.equal(getVerifiedPageState({ loading: false, userData: completeUser }), 'success');
  });

  it('keeps loading state separate from anonymous redirect state', () => {
    assert.equal(getVerifiedPageState({ loading: true, userData: null }), 'loading');
  });

  it('routes profile-incomplete authenticated users through profile completion', () => {
    assert.deepEqual(getVerifiedPostAuthResponse('profile_incomplete', completeUser), {
      status: 'profile_incomplete',
      user: completeUser,
      nextStep: 'complete_profile',
    });
  });
});
