import React, { createContext, useContext, useEffect, useState } from 'react';
import request, { getToken, removeToken } from './api/apiClient';

interface AuthContextType {
  user: any | null;
  userData: any | null;
  loading: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true, isAdmin: false, refreshUser: async () => {}, logout: () => {} });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await request('/auth/me');
      setUser({ uid: data.user.id, email: data.user.email }); // map id to uid for compatibility
      setUserData(data.user);
    } catch (error) {
      console.error(error);
      setUser(null);
      setUserData(null);
      removeToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    removeToken();
    setUser(null);
    setUserData(null);
  };

  const isAdmin = userData?.isAdmin === true;

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAdmin, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
