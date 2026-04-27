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
const MerchantLayout = lazy(() => import('../components/merchant/MerchantLayout').then((module) => ({
  default: module.MerchantLayout,
})));
const MerchantDashboardPage = lazy(() => import('../pages/merchant/MerchantDashboardPage'));
const MerchantOrderDeskPage = lazy(() => import('../pages/merchant/OrderDeskPage'));
const MerchantLiquidityPage = lazy(() => import('../pages/merchant/LiquidityPage'));
const MerchantAlertsPage = lazy(() => import('../pages/merchant/AlertsPage'));
const MerchantDepositsPage = lazy(() => import('../pages/merchant/DepositsPage'));

function AuthRoute() {
  const { user } = useAuth();
  return user ? <Navigate replace to="/" /> : <AuthPage />;
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/merchant" element={<ProtectedRoute requireAdmin={true} redirectTo="/bank" />}>
            <Route element={<MerchantLayout />}>
              <Route index element={<MerchantDashboardPage />} />
              <Route path="orders" element={<MerchantOrderDeskPage />} />
              <Route path="deposits" element={<MerchantDepositsPage />} />
              <Route path="liquidity" element={<MerchantLiquidityPage />} />
              <Route path="alerts" element={<MerchantAlertsPage />} />
              <Route path="*" element={<Navigate replace to="/merchant" />} />
            </Route>
          </Route>

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
