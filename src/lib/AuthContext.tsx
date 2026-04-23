import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import request from './api/apiClient';
import type { AuthResponseDTO, UserDTO } from '../types/api';

interface AuthContextType {
  user: { uid: string; email: string } | null;
  userData: UserDTO | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAdmin: false,
  refreshUser: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null);
  const [userData, setUserData] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await request<AuthResponseDTO>('/auth/me');
      setUser({ uid: data.user.id, email: data.user.email }); // map id to uid for compatibility
      setUserData(data.user);
    } catch {
      setUser(null);
      setUserData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // no-op: local state must still clear
    }
    setUser(null);
    setUserData(null);
  }, []);

  const isAdmin = userData?.isAdmin === true;

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAdmin, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
