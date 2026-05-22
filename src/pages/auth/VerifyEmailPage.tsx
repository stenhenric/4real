import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { useAuth } from '../../app/AuthProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { getPostAuthRedirectPath } from '../../features/auth/auth-routing';
import { scrubSensitiveTokenFromCurrentUrl } from '../../features/auth/url-token';
import { consumeVerificationEmail, resendVerificationEmail } from '../../services/auth.service';
import { getApiErrorMessage } from '../../utils/errors';

function getVerificationError(value: string | null) {
  if (value === 'missing') {
    return 'The verification link is missing a token. Request a new email below.';
  }

  if (value === 'expired') {
    return 'That verification link is invalid or expired. Request a fresh one below.';
  }

  return null;
}

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { userData, setAuthStateFromResponse } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { info, success, error: showError } = useToast();
  const [token] = useState(() => searchParams.get('token')?.trim() ?? '');
  const initialEmail = searchParams.get('email')?.trim() || userData?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [consuming, setConsuming] = useState(token.length > 0);
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    ((location.state ?? null) as { previewUrl?: string } | null)?.previewUrl ?? null,
  );
  const startedRef = useRef(false);

  const errorMessage = useMemo(
    () => getVerificationError(searchParams.get('error')),
    [searchParams],
  );

  useEffect(() => {
    if (!token || startedRef.current) {
      return;
    }

    startedRef.current = true;
    scrubSensitiveTokenFromCurrentUrl();
    setConsuming(true);
    setConsumeError(null);

    void consumeVerificationEmail({ token })
      .then((response) => {
        setAuthStateFromResponse(response);
        success('Email verified.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
      })
      .catch((error) => {
        setConsumeError('That verification link is invalid or expired. Request a fresh one below.');
        showError(getApiErrorMessage(error, 'Could not verify email. Request a fresh link.'));
        setConsuming(false);
      });
  }, [navigate, setAuthStateFromResponse, showError, success, token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await resendVerificationEmail(email);
      setPreviewUrl(response.previewUrl ?? null);
      info(response.message ?? 'If it exists, a verification email is on the way.');
    } catch (error) {
      showError(getApiErrorMessage(error, 'Could not resend email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Verify Email"
      title="Verify your email"
      description="Please verify your email address to activate your account. Click the link we sent to your inbox, or request a new link below."
      footer={(
        <p className="text-sm text-black/60">
          Back to{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/login">
            sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {consuming ? (
          <AuthNotice tone="info">
            Verifying your email and setting up your account...
          </AuthNotice>
        ) : null}
        {consumeError || errorMessage ? (
          <AuthNotice tone="warning">{consumeError ?? errorMessage}</AuthNotice>
        ) : null}
        {!token ? (
          <AuthNotice tone="info">
            Clicking the link in your email will verify your address and bring you back here automatically.
          </AuthNotice>
        ) : null}

        {!token || consumeError ? (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <AuthField
              autoComplete="email"
              label="Email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
            <SketchyButton className="w-full py-3 text-base" disabled={loading} type="submit">
              {loading ? 'Sending verification email...' : 'Resend verification email'}
            </SketchyButton>
          </form>
        ) : null}

        {previewUrl ? (
          <AuthNotice tone="info">
            Development preview link:{' '}
            <a className="font-semibold underline" href={previewUrl}>
              open verification link
            </a>
          </AuthNotice>
        ) : null}
      </div>
    </AuthShell>
  );
}
