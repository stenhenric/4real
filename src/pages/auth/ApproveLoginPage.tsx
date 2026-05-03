import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthRedirectPath } from '../../features/auth/auth-routing';
import { consumeSuspiciousLogin } from '../../services/auth.service';

export default function ApproveLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setAuthStateFromResponse } = useAuth();
  const { success, error: showError } = useToast();
  const token = searchParams.get('token')?.trim() ?? '';
  const email = searchParams.get('email')?.trim() ?? '';
  const previewUrl = ((location.state ?? null) as { previewUrl?: string } | null)?.previewUrl ?? null;
  const [consuming, setConsuming] = useState(token.length > 0);
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) {
      return;
    }

    startedRef.current = true;
    setConsuming(true);
    setConsumeError(null);

    void consumeSuspiciousLogin({ token })
      .then((response) => {
        setAuthStateFromResponse(response);
        success('Sign-in approved.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
      })
      .catch((error) => {
        setConsumeError('That sign-in approval link is invalid or expired. Start the sign-in flow again.');
        showError(error instanceof Error ? error.message : 'Unable to approve this sign-in.');
        setConsuming(false);
      });
  }, [navigate, setAuthStateFromResponse, showError, success, token]);

  return (
    <AuthShell
      eyebrow="Sign-In Approval"
      title="Approve the blocked sign-in."
      description="New-device sign-ins require explicit approval before the backend issues a session, which reduces unsafe link activation and session fixation risk."
      footer={(
        <p className="text-sm text-black/60">
          Need to restart?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/login?error=suspicious">
            Return to sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {consuming ? (
          <AuthNotice tone="info">
            Confirming the sign-in approval and issuing a session for this browser.
          </AuthNotice>
        ) : null}

        {!token && !consumeError ? (
          <AuthNotice tone="info">
            Open the sign-in approval link from {email || 'your inbox'} in this browser to continue.
          </AuthNotice>
        ) : null}

        {consumeError ? <AuthNotice tone="warning">{consumeError}</AuthNotice> : null}

        {previewUrl ? (
          <AuthNotice tone="info">
            Development preview link:{' '}
            <a className="font-semibold underline" href={previewUrl}>
              open approval link
            </a>
          </AuthNotice>
        ) : null}
      </div>
    </AuthShell>
  );
}
