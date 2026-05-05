import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthTurnstile, type AuthTurnstileRef } from '../../features/auth/AuthTurnstile';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { AuthNotice, AuthShell, AuthDivider } from '../../features/auth/AuthShell';
import { GoogleAuthButton } from '../../features/auth/GoogleAuthButton';
import { AuthInput } from '../../features/auth/components/AuthInput';
import { PasswordInput } from '../../features/auth/components/PasswordInput';
import { buildVerifyEmailPath, sanitizeInternalPath } from '../../features/auth/auth-routing';
import { registerAccount, requestGoogleOAuthRedirect } from '../../services/auth.service';
import { ApiClientError } from '../../services/api/apiClient';

type RegisterStep = 'account_details' | 'verification';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  
  const [step, setStep] = useState<RegisterStep>('account_details');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | undefined>();
  
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<AuthTurnstileRef>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  // Validation States
  const passwordsMatch = password && confirmPassword ? password === confirmPassword : true;

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const response = await requestGoogleOAuthRedirect();
      if (!response.redirectTo) throw new Error('Google sign-in is not available right now.');
      window.location.assign(response.redirectTo);
    } catch (error) {
      setGoogleLoading(false);
      showError(error instanceof Error ? error.message : 'Unable to start Google sign-in.');
    }
  };

  const requireDetails = () => {
    if (username.trim().length < 3) {
      showError('Please enter a valid username.');
      return false;
    }
    if (email.trim().length === 0) {
      showError('Please enter a valid email.');
      return false;
    }
    if (!isPasswordValid) {
      showError('Please ensure your password meets all requirements.');
      return false;
    }
    if (password !== confirmPassword) {
      showError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 'verification') return;
    
    if (siteKey && !turnstileToken) {
      showError('Please complete the verification.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      return;
    }

    setLoading(true);

    try {
      const response = await registerAccount({ username, email, password, ...(turnstileToken && { turnstileToken }) });
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildVerifyEmailPath({ email: response.email ?? email }), {
        replace: true,
        state: { previewUrl: response.previewUrl },
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'USERNAME_ALREADY_EXISTS') {
        // Send the user back to the details step so they can pick a different username
        setStep('account_details');
        setUsernameError('That username is already taken. Please choose another.');
        setTurnstileToken(undefined);
      } else {
        showError(error instanceof Error ? error.message : 'Unable to create your account right now.');
        turnstileRef.current?.reset();
        setTurnstileToken(undefined);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetStep = () => {
    setStep('account_details');
    setTurnstileToken(undefined);
  };

  return (
    <AuthShell
      eyebrow="Create Account"
      title="Enter with a verified identity."
      description="Your email becomes the sign-in identifier. Your username stays public inside matches, profiles, and leaderboards."
      footer={(
        <p className="text-sm text-black/60 font-bold">
          Already have an account?{' '}
          <Link className="text-ink-blue hover:underline decoration-wavy underline-offset-2" to="/auth/login">
            Sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {step === 'account_details' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <GoogleAuthButton loading={googleLoading} onClick={() => void handleGoogle()} />
            
            <AuthDivider label="Or create account with email" />

            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (requireDetails()) setStep('verification'); }}>
              <AuthInput
                autoComplete="username"
                label="Public Username"
                name="username"
                hint={usernameError ? undefined : 'This is the public handle players see in lobbies.'}
                error={usernameError}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (usernameError) setUsernameError(undefined);
                }}
                placeholder="connect4killer"
                required
                type="text"
                value={username}
                minLength={3}
                maxLength={32}
              />
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
              
              <div className="pt-2">
                <PasswordInput
                  autoComplete="new-password"
                  label="Password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 12 characters"
                  required
                  value={password}
                  showStrengthMeter
                  onValidationChange={setIsPasswordValid}
                />
              </div>

              <AuthInput
                autoComplete="new-password"
                label="Confirm Password"
                name="confirmPassword"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm your password"
                required
                type="password"
                value={confirmPassword}
                error={!passwordsMatch ? 'Passwords do not match' : undefined}
                success={confirmPassword.length > 0 && passwordsMatch}
              />

              <SketchyButton 
                className="w-full py-4 text-xl mt-4" 
                type="submit"
                activeColor="#fff9c4"
              >
                Continue
              </SketchyButton>
            </form>
          </div>
        )}

        {step === 'verification' && (
          <form className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleSubmit}>
            <button 
              type="button" 
              onClick={resetStep}
              className="text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black mb-2 inline-flex items-center gap-1 transition-colors"
            >
              ← Back to details
            </button>

            <AuthNotice tone="info">
              Verify you are human to create the account for {email}.
            </AuthNotice>

            <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

            <SketchyButton 
              className="w-full py-4 text-xl mt-4" 
              disabled={loading || (!!siteKey && !turnstileToken)} 
              type="submit"
              activeColor="#fff9c4"
            >
              {loading ? 'Creating your account...' : 'Create account'}
            </SketchyButton>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
