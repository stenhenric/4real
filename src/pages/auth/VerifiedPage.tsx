import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { RouteLoading } from '../../app/RouteLoading';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthPath } from '../../features/auth/auth-routing';
import { getVerifiedPageState, getVerifiedPostAuthResponse } from './verified-page-state';

export default function VerifiedPage() {
  const navigate = useNavigate();
  const { authStatus, loading, userData } = useAuth();

  useEffect(() => {
    if (loading || !userData) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate(
        getPostAuthPath(getVerifiedPostAuthResponse(authStatus, userData)),
        { replace: true },
      );
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authStatus, loading, navigate, userData]);

  const pageState = getVerifiedPageState({ loading, userData });

  if (pageState === 'loading') {
    return <RouteLoading message="Checking verification..." />;
  }

  if (pageState === 'redirect_login') {
    return <Navigate replace to="/auth/login" />;
  }

  return (
    <AuthShell
      eyebrow="Email Verified"
      title="Your account is active."
      description="Your email address has been successfully verified."
      footer={(
        <p className="text-sm text-black/60">
          If nothing happens, you can continue manually.
        </p>
      )}
    >
      <div className="space-y-6">
        <AuthNotice tone="success">
          Your account is ready! Redirecting you to the app...
        </AuthNotice>

        <div className="flex flex-col gap-3 sm:flex-row">
          <SketchyButton className="flex-1 py-3 text-base" onClick={() => navigate('/play')} type="button">
            Open app
          </SketchyButton>
          <Link
            className="inline-flex flex-1 items-center justify-center border border-black/12 bg-white px-4 py-3 text-base font-semibold text-black transition-colors hover:bg-black/5"
            to="/auth/security"
          >
            Review security settings
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
