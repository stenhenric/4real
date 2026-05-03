import { useState, useRef, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthTurnstile, type AuthTurnstileRef } from '../../features/auth/AuthTurnstile';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { buildVerifyEmailPath, sanitizeInternalPath } from '../../features/auth/auth-routing';
import { registerAccount } from '../../services/auth.service';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<AuthTurnstileRef>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    if (siteKey && !turnstileToken) {
      showError('Please complete the verification.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      setLoading(false);
      return;
    }

    try {
      const response = await registerAccount({ username, email, password, ...(turnstileToken && { turnstileToken }) });
      navigate(sanitizeInternalPath(response.redirectTo) ?? buildVerifyEmailPath({ email: response.email ?? email }), {
        replace: true,
        state: { previewUrl: response.previewUrl },
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to create your account right now.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Create Account"
      title="Enter with a verified identity."
      description="Your email becomes the sign-in identifier. Your username stays public inside matches, profiles, and leaderboards."
      footer={(
        <p className="text-sm text-black/60">
          Already have an account?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/login">
            Sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        <AuthNotice tone="info">
          Passwords must be at least 12 characters. Password managers and pasted passwords are supported.
        </AuthNotice>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            autoComplete="username"
            hint="This is the public handle players see in lobbies and match history."
            label="Public Username"
            maxLength={32}
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="connect4killer"
            required
            type="text"
            value={username}
          />
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
            autoComplete="new-password"
            hint="Use a long passphrase or a password manager generated secret."
            label="Password"
            maxLength={128}
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 12 characters"
            required
            type="password"
            value={password}
          />

          <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

          <SketchyButton className="w-full py-3 text-base" disabled={loading || (!!siteKey && !turnstileToken)} type="submit">
            {loading ? 'Creating your account...' : 'Create account'}
          </SketchyButton>
        </form>
      </div>
    </AuthShell>
  );
}
