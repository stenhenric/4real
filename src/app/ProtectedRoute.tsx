import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

interface ProtectedRouteProps {
  requireAdmin?: boolean;
  allowIncompleteProfile?: boolean;
  redirectTo?: string;
  children?: ReactNode;
}

export function ProtectedRoute({
  requireAdmin = false,
  allowIncompleteProfile = false,
  redirectTo = '/play',
  children,
}: ProtectedRouteProps) {
  const { isAdmin, isProfileComplete, loading, user } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (!user) {
    return <Navigate replace to="/auth/login" />;
  }

  if (!allowIncompleteProfile && !isProfileComplete) {
    return <Navigate replace to="/auth/complete-profile" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate replace to={redirectTo} />;
  }

  return children ? <>{children}</> : <Outlet />;
}
