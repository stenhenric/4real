import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { AppProviders } from './AppProviders';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './AuthProvider';

const AuthPage = lazy(() => import('../pages/AuthPage'));
const BankPage = lazy(() => import('../pages/BankPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const GamePage = lazy(() => import('../pages/GamePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));

function AuthRoute() {
  const { user } = useAuth();
  return user ? <Navigate replace to="/" /> : <AuthPage />;
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/auth" element={<AuthRoute />} />

            <Route element={<ProtectedRoute />}>
              <Route index element={<DashboardPage key="dashboard-lobby" initialTab="lobby" />} />
              <Route
                path="/leaderboard"
                element={<DashboardPage key="dashboard-leaderboard" initialTab="leaderboard" />}
              />
              <Route path="/bank" element={<BankPage />} />
              <Route path="/game/:roomId" element={<GamePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}
