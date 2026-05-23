import type { AuthResponseDTO, AuthStatus, UserDTO } from '../../types/api';

export type VerifiedPageState = 'loading' | 'redirect_login' | 'success';

export function getVerifiedPageState(input: {
  loading: boolean;
  userData: UserDTO | null;
}): VerifiedPageState {
  if (input.loading) {
    return 'loading';
  }

  return input.userData ? 'success' : 'redirect_login';
}

export function getVerifiedPostAuthResponse(
  authStatus: AuthStatus | 'anonymous',
  userData: UserDTO,
): Pick<AuthResponseDTO, 'status' | 'nextStep' | 'user'> {
  if (authStatus === 'profile_incomplete') {
    return {
      status: 'profile_incomplete',
      user: userData,
      nextStep: 'complete_profile',
    };
  }

  return {
    status: 'authenticated',
    user: userData,
  };
}
