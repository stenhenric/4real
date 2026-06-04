import { resolveCurrentSession } from './auth-state.ts';
import type { AuthResponseDTO, AuthStatus, SessionListItemDTO, UserDTO } from '../types/api';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  userData: UserDTO | null;
  currentSession: SessionListItemDTO | null;
  authStatus: AuthStatus | 'anonymous';
  loading: boolean;
}

export type AuthAction =
  | { type: 'AUTH_RESPONSE_APPLIED'; response: AuthResponseDTO | null }
  | { type: 'AUTH_CLEARED' }
  | { type: 'REFRESH_STARTED' }
  | { type: 'REFRESH_SUCCEEDED'; response: AuthResponseDTO }
  | { type: 'REFRESH_FAILED'; clearAuth?: boolean }
  | { type: 'LOADING_FINISHED' };

export function mapAuthUser(data: UserDTO): AuthUser {
  return { id: data.id, email: data.email };
}

export function normalizeAuthStatus(data: AuthResponseDTO): AuthStatus {
  if (
    data.nextStep === 'complete_profile'
    || data.status === 'profile_incomplete'
    || !data.user
    || data.user.username.trim().length === 0
  ) {
    return 'profile_incomplete';
  }

  return 'authenticated';
}

export function createInitialAuthState(): AuthState {
  return {
    user: null,
    userData: null,
    currentSession: null,
    authStatus: 'anonymous',
    loading: true,
  };
}

function applyAuthResponse(state: AuthState, response: AuthResponseDTO | null): AuthState {
  if (!response?.user) {
    return {
      ...state,
      user: null,
      userData: null,
      currentSession: null,
      authStatus: 'anonymous',
      loading: false,
    };
  }

  return {
    ...state,
    user: mapAuthUser(response.user),
    userData: response.user,
    currentSession: resolveCurrentSession(state.currentSession, response),
    authStatus: normalizeAuthStatus(response),
    loading: false,
  };
}

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_RESPONSE_APPLIED':
      return applyAuthResponse(state, action.response);
    case 'AUTH_CLEARED':
      return applyAuthResponse(state, null);
    case 'REFRESH_STARTED':
      return {
        ...state,
        loading: true,
      };
    case 'REFRESH_SUCCEEDED':
      return applyAuthResponse(state, action.response);
    case 'REFRESH_FAILED':
      if (action.clearAuth) {
        return applyAuthResponse(state, null);
      }
      return {
        ...state,
        loading: false,
      };
    case 'LOADING_FINISHED':
      return {
        ...state,
        loading: false,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
