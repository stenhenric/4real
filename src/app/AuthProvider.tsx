import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutRequest } from '../services/auth.service';
import { ApiClientError } from '../services/api/apiClient';
import { shouldClearAuthAfterRefreshError } from '../features/auth/refresh-error';
import { isAbortError } from '../utils/isAbortError';
import type { AuthResponseDTO, AuthStatus, SessionListItemDTO, UserDTO } from '../types/api';
import {
  authReducer,
  createInitialAuthState,
  type AuthUser,
} from './authReducer';

interface AuthContextType {
  user: AuthUser | null;
  userData: UserDTO | null;
  currentSession: SessionListItemDTO | null;
  loading: boolean;
  authStatus: AuthStatus | 'anonymous';
  isAdmin: boolean;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  refreshUser: (signal?: AbortSignal) => Promise<AuthResponseDTO | null>;
  setAuthStateFromResponse: (response: AuthResponseDTO | null) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, dispatchAuth] = useReducer(authReducer, undefined, createInitialAuthState);
  const {
    user,
    userData,
    currentSession,
    authStatus,
    loading,
  } = authState;
  const authGenerationRef = useRef(0);
  const refreshRequestRef = useRef(0);

  const setAuthStateFromResponse = useCallback((response: AuthResponseDTO | null) => {
    authGenerationRef.current += 1;
    dispatchAuth({ type: 'AUTH_RESPONSE_APPLIED', response });
  }, []);

  const clearAuth = useCallback(() => {
    setAuthStateFromResponse(null);
  }, [setAuthStateFromResponse]);

  const refreshUser = useCallback(async (signal?: AbortSignal) => {
    const requestGeneration = authGenerationRef.current;
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;

    const isStaleRefresh = () => (
      signal?.aborted
      || authGenerationRef.current !== requestGeneration
      || refreshRequestRef.current !== requestId
    );

    try {
      if (isStaleRefresh()) {
        return null;
      }

      const data = await getCurrentUser(signal);
      if (isStaleRefresh()) {
        return null;
      }

      dispatchAuth({ type: 'REFRESH_SUCCEEDED', response: data });
      return data;
    } catch (error) {
      if (isAbortError(error, signal) || isStaleRefresh()) {
        return null;
      }

      if (shouldClearAuthAfterRefreshError(error)) {
        clearAuth();
        return null;
      }
    }

    dispatchAuth({ type: 'REFRESH_FAILED' });
    return null;
  }, [clearAuth]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshUser(controller.signal);

    return () => {
      controller.abort();
    };
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      if (!(error instanceof ApiClientError && error.status === 401)) {
        throw error;
      }
    }

    clearAuth();
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      user,
      userData,
      currentSession,
      loading,
      authStatus,
      isAdmin: userData?.isAdmin === true,
      isAuthenticated: user !== null,
      isProfileComplete: authStatus === 'authenticated',
      refreshUser,
      setAuthStateFromResponse,
      clearAuth,
      logout,
    }),
    [authStatus, clearAuth, currentSession, loading, logout, refreshUser, setAuthStateFromResponse, user, userData],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
