import { useState, useRef, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthTurnstile, type AuthTurnstileRef } from '../../features/auth/AuthTurnstile';
import { getTurnstileSiteKey } from '../../features/auth/turnstile-config';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthDivider, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { GoogleAuthButton } from '../../features/auth/GoogleAuthButton';
import { AuthInput } from '../../features/auth/components/AuthInput';
import { PasswordInput } from '../../features/auth/components/PasswordInput';
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
  if (value === 'google') return 'Google sign-in did not complete. Try again or use email and password.';
  if (value === 'google_account_verification_required') {
    return 'Verify or recover the existing account before using Google sign-in.';
  }
  if (value === 'suspicious') return 'That sign-in approval link is invalid or expired. Start the sign-in flow again.';
  if (value === 'session') return 'Your session expired. Sign in again to continue.';
  return null;
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type LoginStep = 'method_selection' | 'password_entry' | 'magic_link_verification';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = sanitizeInternalPath(searchParams.get('redirectTo')) ?? '/play';
  const inlineError = getErrorMessage(searchParams.get('error'));
  const { setAuthStateFromResponse } = useAuth();
  const { success, error: showError, info } = useToast();
  
  const [step, setStep] = useState<LoginStep>('method_selection');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<AuthTurnstileRef>(null);
  const siteKey = getTurnstileSiteKey();

  const verificationState = (location.state ?? null) as { previewUrl?: string } | null;

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 'password_entry') return;
    
    setPasswordLoading(true);

    if (siteKey && !turnstileToken) {
      showError('Please complete the verification.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      setPasswordLoading(false);
      return;
    }

    try {
      const loginIdentifier = identifier.trim();
      if (!loginIdentifier) {
        showError('Please enter your email or username.');
        setPasswordLoading(false);
        return;
      }

      const response = await loginPassword({
        identifier: loginIdentifier,
        password,
        redirectTo,
        ...(turnstileToken && { turnstileToken }),
      });

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

      const verificationEmail = response.email ?? (isLikelyEmail(loginIdentifier) ? loginIdentifier : null);
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildVerifyEmailPath(
        verificationEmail ? { email: verificationEmail } : undefined,
      ), {
        replace: true,
        state: { previewUrl: response.previewUrl ?? verificationState?.previewUrl },
      });
    } catch (error) {
      showError('Invalid email or password. Please try again.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      setPassword(''); 
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 'magic_link_verification') return;
    
    setMagicLoading(true);

    if (siteKey && !turnstileToken) {
      showError('Please complete the verification.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      setMagicLoading(false);
      return;
    }

    try {
      const email = identifier.trim();
      if (!isLikelyEmail(email)) {
        showError('Enter your email to receive a magic link.');
        turnstileRef.current?.reset();
        setTurnstileToken(undefined);
        setMagicLoading(false);
        return;
      }

      const response = await requestMagicLink({ email, redirectTo, ...(turnstileToken && { turnstileToken }) });
      info(response.message ?? 'If it exists, a sign-in link is on the way.');
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildMagicLinkPath({ email }), {
        replace: false,
        state: { previewUrl: response.previewUrl },
      });
    } catch (error) {
      showError('Could not send magic link.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    } finally {
      setMagicLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const response = await requestGoogleOAuthRedirect(redirectTo);
      if (!response.redirectTo) throw new Error('Google sign-in is not available right now.');
      window.location.assign(response.redirectTo);
    } catch (error) {
      setGoogleLoading(false);
      showError('Unable to start Google sign-in.');
    }
  };

  const requireIdentifier = () => {
    if (identifier.trim().length === 0) {
      showError('Please enter your email or username.');
      return false;
    }
    return true;
  };

  const requireEmail = () => {
    if (identifier.trim().length === 0) {
      showError('Please enter your email first.');
      return false;
    }
    if (!isLikelyEmail(identifier)) {
      showError('Enter your email to receive a magic link.');
      return false;
    }
    return true;
  };

  const resetStep = () => {
    setStep('method_selection');
    setTurnstileToken(undefined);
    setPassword('');
  };

  return (
    <AuthShell
      eyebrow="Account Access"
      title="Welcome back."
      description="Sign in with email, username, or Google. Your account security is our top priority."
      footer={(
        <p className="text-sm text-black/60 font-bold">
          New here?{' '}
          <Link className="text-ink-blue hover:underline decoration-wavy underline-offset-2" to="/auth/register">
            Create your account
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {inlineError ? <AuthNotice tone="warning">{inlineError}</AuthNotice> : null}

        {step === 'method_selection' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <GoogleAuthButton loading={googleLoading} onClick={() => void handleGoogle()} />
            
            <AuthDivider label="Or continue with email or username" />

            <div className="space-y-4">
              <AuthInput
                autoComplete="username"
                label="Email or username"
                name="identifier"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="name@example.com or SketchMaster"
                required
                type="text"
                value={identifier}
              />

              <div className="pt-4 flex flex-col gap-3">
                <SketchyButton 
                  className="w-full py-3" 
                  onClick={() => requireIdentifier() && setStep('password_entry')}
                  type="button"
                  variant="primary"
                >
                  Continue with Password
                </SketchyButton>

                <SketchyButton
                  className="w-full py-3 text-sm font-bold text-black/60 opacity-70 hover:opacity-100 transition-opacity"
                  onClick={() => requireEmail() && setStep('magic_link_verification')}
                  type="button"
                >
                  Email me a magic link instead
                </SketchyButton>
              </div>
            </div>
          </div>
        )}

        {step === 'password_entry' && (
          <form className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handlePasswordLogin}>
            <SketchyButton
              type="button"
              onClick={resetStep}
              className="text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black mb-2 inline-flex items-center gap-1 transition-colors"
            >
              ← Back to options
            </SketchyButton>
            
            <AuthInput
              autoComplete="username"
              label="Email or username"
              name="identifier"
              disabled
              type="text"
              value={identifier}
            />
            
            <div className="pt-2 relative">
              <PasswordInput
                autoComplete="current-password"
                label="Password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                value={password}
              />
              <div className="absolute top-1 right-1">
                <Link
                  className="text-[10px] font-bold uppercase tracking-widest text-ink-blue/70 hover:text-ink-blue transition-colors hover:underline"
                  to="/auth/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

            <div className="pt-4 flex flex-col gap-3">
              <SketchyButton 
                className="w-full py-4 text-xl" 
                disabled={passwordLoading || (!!siteKey && !turnstileToken)} 
                type="submit"
                variant="primary"
              >
                {passwordLoading ? 'Signing in...' : 'Sign in'}
              </SketchyButton>
            </div>
          </form>
        )}

        {step === 'magic_link_verification' && (
          <form className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleMagicLinkSubmit}>
            <SketchyButton
              type="button"
              onClick={resetStep}
              className="text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black mb-2 inline-flex items-center gap-1 transition-colors"
            >
              ← Back to options
            </SketchyButton>

            <AuthNotice tone="info">
              Please complete the verification below to send a magic link to {identifier.trim()}.
            </AuthNotice>

            <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

            <div className="pt-4 flex flex-col gap-3">
              <SketchyButton 
                className="w-full py-4 text-xl" 
                disabled={magicLoading || (!!siteKey && !turnstileToken)} 
                type="submit"
                variant="primary"
              >
                {magicLoading ? 'Sending link...' : 'Send Magic Link'}
              </SketchyButton>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
