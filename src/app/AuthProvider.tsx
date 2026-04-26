import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutRequest } from '../services/auth.service';
import { isAbortError } from '../utils/isAbortError';
import type { AuthResponseDTO, UserDTO } from '../types/api';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  userData: UserDTO | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUser: (signal?: AbortSignal) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthUser(data: AuthResponseDTO): AuthUser {
  return { id: data.user.id, email: data.user.email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userData, setUserData] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getCurrentUser(signal);
      setUser(mapAuthUser(data));
      setUserData(data.user);
    } catch (error) {
      if (isAbortError(error)) {
        // StrictMode unmount aborted this request — skip all state updates
        // so the second mount's request can resolve cleanly.
        return;
      }

      setUser(null);
      setUserData(null);
    }

    setLoading(false);
  }, []);

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
    } catch {
      // Local auth state must still clear if the request fails.
    }

    setUser(null);
    setUserData(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      userData,
      loading,
      isAdmin: userData?.isAdmin === true,
      refreshUser,
      logout,
    }),
    [loading, logout, refreshUser, user, userData],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
