import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { buildMfaChallengePath, getPostAuthRedirectPath, sanitizeInternalPath } from '../../features/auth/auth-routing';
import { scrubSensitiveTokenFromCurrentUrl } from '../../features/auth/url-token';
import { consumeMagicLink } from '../../services/auth.service';
import { getApiErrorMessage } from '../../utils/errors';

export default function MagicLinkPage() {
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

    void consumeMagicLink({ token })
      .then((response) => {
        if (response.status === 'requires_mfa' && response.challengeId) {
          navigate(
            buildMfaChallengePath({
              challengeId: response.challengeId,
              challengeReason: response.challengeReason ?? 'suspicious_login',
              returnTo: sanitizeInternalPath(response.redirectTo) ?? '/play',
            }),
            { replace: true },
          );
          return;
        }

        setAuthStateFromResponse(response);
        success('Signed in.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
      })
      .catch((error) => {
        setConsumeError('That sign-in link is invalid or expired. Request a fresh magic link to continue.');
        showError(getApiErrorMessage(error, 'Unable to complete magic-link sign-in.'));
      });
  }, [navigate, setAuthStateFromResponse, showError, success, token]);

  return (
    <AuthShell
      eyebrow="Magic Link"
      title="Finish signing in"
      description="We are verifying your magic link. You will be signed in and redirected automatically in a moment."
      footer={(
        <p className="text-sm text-black/60">
          Need another link?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/login">
            Return to sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {consuming ? (
          <AuthNotice tone="info">
            Verifying your sign-in link...
          </AuthNotice>
        ) : null}

        {!token && !consumeError ? (
          <AuthNotice tone="info">
            Please check {email || 'your inbox'} for the sign-in link and open it on this device to continue.
          </AuthNotice>
        ) : null}

        {consumeError ? <AuthNotice tone="warning">{consumeError}</AuthNotice> : null}

        {previewUrl ? (
          <AuthNotice tone="info">
            Development preview link:{' '}
            <a className="font-semibold underline" href={previewUrl}>
              open magic link
            </a>
          </AuthNotice>
        ) : null}
      </div>
    </AuthShell>
  );
}
