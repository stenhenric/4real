import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

export function ProtectedRoute() {
  const { loading, user } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (!user) {
    return <Navigate replace to="/auth" />;
  }

  return <Outlet />;
}
