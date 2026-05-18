import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutRequest } from '../services/auth.service';
import { ApiClientError } from '../services/api/apiClient';
import { shouldClearAuthAfterRefreshError } from '../features/auth/refresh-error';
import { isAbortError } from '../utils/isAbortError';
import type { AuthResponseDTO, AuthStatus, SessionListItemDTO, UserDTO } from '../types/api';

interface AuthUser {
  id: string;
  email: string;
}

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

function mapAuthUser(data: UserDTO): AuthUser {
  return { id: data.id, email: data.email };
}

function normalizeAuthStatus(data: AuthResponseDTO): AuthStatus {
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userData, setUserData] = useState<UserDTO | null>(null);
  const [currentSession, setCurrentSession] = useState<SessionListItemDTO | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | 'anonymous'>('anonymous');
  const [loading, setLoading] = useState(true);
  const authGenerationRef = useRef(0);
  const refreshRequestRef = useRef(0);

  const applyAuthState = useCallback((response: AuthResponseDTO | null) => {
    if (!response?.user) {
      setUser(null);
      setUserData(null);
      setCurrentSession(null);
      setAuthStatus('anonymous');
      return;
    }

    setUser(mapAuthUser(response.user));
    setUserData(response.user);
    setCurrentSession(response.session ?? null);
    setAuthStatus(normalizeAuthStatus(response));
  }, []);

  const setAuthStateFromResponse = useCallback((response: AuthResponseDTO | null) => {
    authGenerationRef.current += 1;
    applyAuthState(response);
    setLoading(false);
  }, [applyAuthState]);

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

      applyAuthState(data);
      setLoading(false);
      return data;
    } catch (error) {
      if (isAbortError(error, signal) || isStaleRefresh()) {
        return null;
      }

      if (shouldClearAuthAfterRefreshError(error)) {
        clearAuth();
        setLoading(false);
        return null;
      }
    }

    setLoading(false);
    return null;
  }, [applyAuthState, clearAuth]);

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
    setLoading(false);
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
