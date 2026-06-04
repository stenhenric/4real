import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthRedirectPath } from '../../features/auth/auth-routing';
import { scrubSensitiveTokenFromCurrentUrl } from '../../features/auth/url-token';
import { consumeSuspiciousLogin } from '../../services/auth.service';
import { getApiErrorMessage } from '../../utils/errors';

export default function ApproveLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setAuthStateFromResponse } = useAuth();
  const { success, error: showError } = useToast();
  const tokenRef = useRef(searchParams.get('token')?.trim() ?? '');
  const token = tokenRef.current;
  const email = searchParams.get('email')?.trim() ?? '';
  const previewUrl = ((location.state ?? null) as { previewUrl?: string } | null)?.previewUrl ?? null;
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const consuming = token.length > 0 && !consumeError;

  useEffect(() => {
    if (!token || startedRef.current) {
      return;
    }

    startedRef.current = true;
    scrubSensitiveTokenFromCurrentUrl();
    setConsumeError(null);

    void consumeSuspiciousLogin({ token })
      .then((response) => {
        setAuthStateFromResponse(response);
        success('Sign-in approved.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
      })
      .catch((error) => {
        setConsumeError('That sign-in approval link is invalid or expired. Start the sign-in flow again.');
        showError(getApiErrorMessage(error, 'Unable to approve this sign-in.'));
      });
  }, [navigate, setAuthStateFromResponse, showError, success, token]);

  return (
    <AuthShell
      eyebrow="Sign-In Approval"
      title="Approve your sign-in"
      description="To keep your account secure, we need you to approve sign-ins from new devices or locations."
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
            Verifying your sign-in approval...
          </AuthNotice>
        ) : null}

        {!token && !consumeError ? (
          <AuthNotice tone="info">
            Please open the approval link we sent to {email || 'your inbox'} on this device to continue.
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
