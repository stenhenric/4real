import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { loading, user, isProfileComplete } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (user) {
    return <Navigate replace to={isProfileComplete ? '/play' : '/auth/complete-profile'} />;
  }

  return <>{children}</>;
}
