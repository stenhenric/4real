import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

interface ProtectedRouteProps {
  requireAdmin?: boolean;
  redirectTo?: string;
}

export function ProtectedRoute({
  requireAdmin = false,
  redirectTo = '/',
}: ProtectedRouteProps) {
  const { isAdmin, loading, user } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (!user) {
    return <Navigate replace to="/auth" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate replace to={redirectTo} />;
  }

  return <Outlet />;
}
