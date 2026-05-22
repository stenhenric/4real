import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { AuthNavigationHandler } from './AuthNavigationHandler';
import { AppProviders } from './AppProviders';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicLayout } from './PublicLayout';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { RouteLoading } from './RouteLoading';
import { useAuth } from './AuthProvider';

const LandingPage = lazy(() => import('../pages/LandingPage'));
const PrivacyPolicyPage = lazy(() => import('../pages/PrivacyPolicyPage'));
const TermsOfUsePage = lazy(() => import('../pages/TermsOfUsePage'));
const BankPage = lazy(() => import('../pages/BankPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const GamePage = lazy(() => import('../pages/GamePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage'));
const MagicLinkPage = lazy(() => import('../pages/auth/MagicLinkPage'));
const ApproveLoginPage = lazy(() => import('../pages/auth/ApproveLoginPage'));
const VerifiedPage = lazy(() => import('../pages/auth/VerifiedPage'));
const CompleteProfilePage = lazy(() => import('../pages/auth/CompleteProfilePage'));
const MfaChallengePage = lazy(() => import('../pages/auth/MfaChallengePage'));
const SecuritySettingsPage = lazy(() => import('../pages/auth/SecuritySettingsPage'));
const MerchantLayout = lazy(() => import('../components/merchant/MerchantLayout').then((module) => ({
  default: module.MerchantLayout,
})));
const MerchantDashboardPage = lazy(() => import('../pages/merchant/MerchantDashboardPage'));
const MerchantOrderDeskPage = lazy(() => import('../pages/merchant/OrderDeskPage'));
const MerchantLiquidityPage = lazy(() => import('../pages/merchant/LiquidityPage'));
const MerchantAlertsPage = lazy(() => import('../pages/merchant/AlertsPage'));
const MerchantDepositsPage = lazy(() => import('../pages/merchant/DepositsPage'));

function AuthIndexRoute() {
  const { loading, user, isProfileComplete } = useAuth();

  if (loading) {
    return <RouteLoading />;
  }

  if (user) {
    return <Navigate replace to={isProfileComplete ? '/play' : '/auth/complete-profile'} />;
  }

  return <Navigate replace to="/auth/login" />;
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AuthNavigationHandler />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfUsePage />} />
            <Route path="/auth" element={<AuthIndexRoute />} />
            <Route path="/auth/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
            <Route path="/auth/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
            <Route path="/auth/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
            <Route path="/auth/reset-password" element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>} />
            <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth/magic-link" element={<MagicLinkPage />} />
            <Route path="/auth/approve-login" element={<ApproveLoginPage />} />
            <Route path="/auth/verified" element={<VerifiedPage />} />
            <Route path="/auth/mfa" element={<MfaChallengePage />} />
            <Route
              path="/auth/complete-profile"
              element={<ProtectedRoute allowIncompleteProfile={true}><CompleteProfilePage /></ProtectedRoute>}
            />
          </Route>

          <Route element={<AppLayout />}>
            <Route path="/auth/security" element={<ProtectedRoute><SecuritySettingsPage /></ProtectedRoute>} />

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

            <Route element={<ProtectedRoute />}>
              <Route path="/play" element={<DashboardPage key="dashboard-lobby" initialTab="lobby" />} />
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
