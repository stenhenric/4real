import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';
import {
  AUTH_REDIRECT_EVENT,
  SESSION_EXPIRED_EVENT,
  type AuthRedirectEventDetail,
} from '../features/auth/auth-events';
import {
  buildMfaChallengePath,
  buildVerifyEmailPath,
} from '../features/auth/auth-routing';

export function AuthNavigationHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearAuth } = useAuth();
  const { info } = useToast();

  useEffect(() => {
    const handleAuthRedirect = (event: Event) => {
      const detail = (event as CustomEvent<AuthRedirectEventDetail>).detail;
      if (!detail) {
        return;
      }

      if (detail.code === 'MFA_REQUIRED' && detail.challengeId) {
        navigate(
          buildMfaChallengePath({
            challengeId: detail.challengeId,
            challengeReason: detail.challengeReason ?? 'sensitive_action',
            returnTo: detail.returnTo ?? `${location.pathname}${location.search}`,
          }),
          { replace: true },
        );
        return;
      }

      if (detail.code === 'MFA_SETUP_REQUIRED') {
        navigate('/auth/security?setup=1', { replace: true });
        return;
      }

      if (detail.code === 'PROFILE_COMPLETION_REQUIRED') {
        navigate('/auth/complete-profile', { replace: true });
        return;
      }

      if (detail.code === 'EMAIL_VERIFICATION_REQUIRED') {
        navigate(buildVerifyEmailPath(), { replace: true });
      }
    };

    const handleSessionExpired = () => {
      clearAuth();
      if (location.pathname.startsWith('/auth')) {
        return;
      }

      info('Session expired. Sign in to continue.');
      navigate('/auth/login?error=session', { replace: true });
    };

    window.addEventListener(AUTH_REDIRECT_EVENT, handleAuthRedirect);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener(AUTH_REDIRECT_EVENT, handleAuthRedirect);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [clearAuth, info, location.pathname, location.search, navigate]);

  return null;
}
