import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthTurnstile } from '../../features/auth/AuthTurnstile';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import {
  AuthDivider,
  AuthField,
  AuthNotice,
  AuthShell,
} from '../../features/auth/AuthShell';
import { GoogleAuthButton } from '../../features/auth/GoogleAuthButton';
import {
  buildMagicLinkPath,
  buildMfaChallengePath,
  buildVerifyEmailPath,
  getPostAuthRedirectPath,
  sanitizeInternalPath,
} from '../../features/auth/auth-routing';
import {
  loginPassword,
  requestGoogleOAuthRedirect,
  requestMagicLink,
} from '../../services/auth.service';

function getErrorMessage(value: string | null) {
  if (value === 'google') {
    return 'Google sign-in did not complete. Try again or use email and password.';
  }

  if (value === 'suspicious') {
    return 'That sign-in approval link is invalid or expired. Start the sign-in flow again.';
  }

  if (value === 'session') {
    return 'Your session expired. Sign in again to continue.';
  }

  return null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeInternalPath(searchParams.get('redirectTo')) ?? '/play';
  const inlineError = getErrorMessage(searchParams.get('error'));
  const { setAuthStateFromResponse } = useAuth();
  const { success, error: showError, info } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();

  const verificationState = (location.state ?? null) as { previewUrl?: string } | null;

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordLoading(true);

    try {
      const response = await loginPassword({ email, password, ...(turnstileToken && { turnstileToken }) });

      if (response.user) {
        setAuthStateFromResponse(response);
        success('Signed in.');
        navigate(getPostAuthRedirectPath(response), { replace: true });
        return;
      }

      if (response.status === 'requires_mfa' && response.challengeId) {
        navigate(
          buildMfaChallengePath({
            challengeId: response.challengeId,
            challengeReason: response.challengeReason ?? 'suspicious_login',
            returnTo: redirectTo,
          }),
          { replace: true },
        );
        return;
      }

      navigate(sanitizeInternalPath(response.redirectTo) ?? buildVerifyEmailPath({ email: response.email ?? email }), {
        replace: true,
        state: { previewUrl: response.previewUrl ?? verificationState?.previewUrl },
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to sign in right now.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (email.trim().length === 0) {
      showError('Enter your email before requesting a magic link.');
      return;
    }

    setMagicLoading(true);

    try {
      const response = await requestMagicLink({ email, redirectTo, ...(turnstileToken && { turnstileToken }) });
      info(response.message ?? 'If the account exists, a sign-in link is on the way.');
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildMagicLinkPath({ email }), {
        replace: false,
        state: { previewUrl: response.previewUrl },
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to send a magic link right now.');
    } finally {
      setMagicLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);

    try {
      const response = await requestGoogleOAuthRedirect(redirectTo);
      if (!response.redirectTo) {
        throw new Error('Google sign-in is not available right now.');
      }

      window.location.assign(response.redirectTo);
    } catch (error) {
      setGoogleLoading(false);
      showError(error instanceof Error ? error.message : 'Unable to start Google sign-in.');
    }
  };

  return (
    <AuthShell
      eyebrow="Account Access"
      title="Sign in without friction."
      description="Use email and password, a magic link, or Google. Sensitive actions are step-up protected after you are inside."
      footer={(
        <p className="text-sm text-black/60">
          New here?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/register">
            Create your account
          </Link>
          {' '}or{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/forgot-password">
            reset your password
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {inlineError ? <AuthNotice tone="warning">{inlineError}</AuthNotice> : null}

        <form className="space-y-5" onSubmit={handlePasswordLogin}>
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
          <AuthField
            autoComplete="current-password"
            label="Password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type="password"
            value={password}
          />

          <AuthTurnstile onSuccess={setTurnstileToken} />

          <SketchyButton className="w-full py-3 text-base" disabled={passwordLoading} type="submit">
            {passwordLoading ? 'Signing in...' : 'Sign in'}
          </SketchyButton>
        </form>

        <AuthDivider label="Other secure options" />

        <div className="space-y-3">
          <GoogleAuthButton loading={googleLoading} onClick={() => void handleGoogle()} />
          <button
            className="w-full rounded-full border border-black/12 bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-black/5"
            disabled={magicLoading}
            onClick={() => void handleMagicLink()}
            type="button"
          >
            {magicLoading ? 'Sending your magic link...' : 'Email me a magic link'}
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
