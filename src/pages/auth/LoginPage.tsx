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
  if (value === 'suspicious') return 'That sign-in approval link is invalid or expired. Start the sign-in flow again.';
  if (value === 'session') return 'Your session expired. Sign in again to continue.';
  return null;
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
  const [email, setEmail] = useState('');
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
      const response = await requestMagicLink({ email, redirectTo, ...(turnstileToken && { turnstileToken }) });
      info(response.message ?? 'If the account exists, a sign-in link is on the way.');
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildMagicLinkPath({ email }), {
        replace: false,
        state: { previewUrl: response.previewUrl },
      });
    } catch (error) {
      showError('Unable to send a magic link right now. Please try again.');
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

  const requireEmail = () => {
    if (email.trim().length === 0) {
      showError('Please enter your email first.');
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
      title="Sign in without friction."
      description="Use email and password, a magic link, or Google. Sensitive actions are step-up protected after you are inside."
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
            
            <AuthDivider label="Or continue with email" />

            <div className="space-y-4">
              <AuthInput
                autoComplete="email"
                label="Email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />

              <div className="pt-4 flex flex-col gap-3">
                <SketchyButton 
                  className="w-full py-3" 
                  onClick={() => requireEmail() && setStep('password_entry')}
                  type="button"
                  activeColor="#fff9c4"
                >
                  Continue with Password
                </SketchyButton>

                <button
                  className="w-full rounded-[20px] border-2 border-black/10 bg-white px-4 py-3 text-sm font-bold text-black/60 transition-colors hover:bg-black/5 hover:text-black focus:outline-none focus:border-ink-blue"
                  onClick={() => requireEmail() && setStep('magic_link_verification')}
                  type="button"
                >
                  Email me a magic link instead
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'password_entry' && (
          <form className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handlePasswordLogin}>
            <button 
              type="button" 
              onClick={resetStep}
              className="text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black mb-2 inline-flex items-center gap-1 transition-colors"
            >
              ← Back to options
            </button>
            
            <AuthInput
              autoComplete="email"
              label="Email"
              name="email"
              disabled
              type="email"
              value={email}
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
                activeColor="#fff9c4"
              >
                {passwordLoading ? 'Signing in...' : 'Sign in'}
              </SketchyButton>
            </div>
          </form>
        )}

        {step === 'magic_link_verification' && (
          <form className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleMagicLinkSubmit}>
            <button 
              type="button" 
              onClick={resetStep}
              className="text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black mb-2 inline-flex items-center gap-1 transition-colors"
            >
              ← Back to options
            </button>

            <AuthNotice tone="info">
              Verify you are human to send a magic link to {email}.
            </AuthNotice>

            <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

            <div className="pt-4 flex flex-col gap-3">
              <SketchyButton 
                className="w-full py-4 text-xl" 
                disabled={magicLoading || (!!siteKey && !turnstileToken)} 
                type="submit"
                activeColor="#fff9c4"
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
