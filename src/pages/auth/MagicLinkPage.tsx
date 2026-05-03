import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthRedirectPath } from '../../features/auth/auth-routing';
import { consumeMagicLink } from '../../services/auth.service';

export default function MagicLinkPage() {
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

    void consumeMagicLink({ token })
      .then((response) => {
        setAuthStateFromResponse(response);
        success('Signed in.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
      })
      .catch((error) => {
        setConsumeError('That sign-in link is invalid or expired. Request a fresh magic link to continue.');
        showError(error instanceof Error ? error.message : 'Unable to complete magic-link sign-in.');
        setConsuming(false);
      });
  }, [navigate, setAuthStateFromResponse, showError, success, token]);

  return (
    <AuthShell
      eyebrow="Magic Link"
      title="Finish sign-in in this browser."
      description="Magic links are single-use and only activate a session after this page securely posts the token back to the backend."
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
            Verifying your magic link and issuing a session for this browser.
          </AuthNotice>
        ) : null}

        {!token && !consumeError ? (
          <AuthNotice tone="info">
            Check {email || 'your inbox'} for the secure sign-in link, then open it in this browser to continue.
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
