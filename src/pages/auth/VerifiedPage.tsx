import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthPath } from '../../features/auth/auth-routing';

export default function VerifiedPage() {
  const navigate = useNavigate();
  const { authStatus, loading, userData } = useAuth();

  useEffect(() => {
    if (loading || !userData) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      navigate(
        getPostAuthPath({
          status: authStatus === 'profile_incomplete' ? 'profile_incomplete' : 'authenticated',
          user: userData,
          ...(authStatus === 'profile_incomplete' ? { nextStep: 'complete_profile' as const } : {}),
        }),
        { replace: true },
      );
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authStatus, loading, navigate, userData]);

  return (
    <AuthShell
      eyebrow="Email Verified"
      title="Your account is active."
      description="We have confirmed your email address and issued a session for this browser."
      footer={(
        <p className="text-sm text-black/60">
          If nothing happens, you can continue manually.
        </p>
      )}
    >
      <div className="space-y-6">
        <AuthNotice tone="success">
          Verification complete. You can continue into the app now.
        </AuthNotice>

        <div className="flex flex-col gap-3 sm:flex-row">
          <SketchyButton className="flex-1 py-3 text-base" onClick={() => navigate('/play')} type="button">
            Open app
          </SketchyButton>
          <Link
            className="inline-flex flex-1 items-center justify-center rounded-full border border-black/12 bg-white px-4 py-3 text-base font-semibold text-black transition-colors hover:bg-black/5"
            to="/auth/security"
          >
            Review security settings
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
