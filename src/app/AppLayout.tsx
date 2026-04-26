import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

export function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col paper-texture">
      {user && <Navbar />}
      <main className="flex-1 container mx-auto px-4 py-8 pb-20 md:pb-8">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
