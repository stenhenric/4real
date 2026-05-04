import { useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthTurnstile, type AuthTurnstileRef } from '../../features/auth/AuthTurnstile';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { requestPasswordReset } from '../../services/auth.service';

export default function ForgotPasswordPage() {
  const { info, error: showError } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<AuthTurnstileRef>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.TURNSTILE_SITE_KEY;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    if (siteKey && !turnstileToken) {
      showError('Please complete the bot check.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
      setLoading(false);
      return;
    }

    try {
      const response = await requestPasswordReset(email, turnstileToken || undefined);
      setPreviewUrl(response.previewUrl ?? null);
      info(response.message ?? 'If the account exists, a reset link is on the way.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to start password reset.');
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Password Recovery"
      title="Reset access without exposing account state."
      description="Enter your email and we will send a single-use password reset link if the account is eligible."
      footer={(
        <p className="text-sm text-black/60">
          Remembered your password?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/login">
            Return to sign in
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
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

          <AuthTurnstile ref={turnstileRef} onSuccess={setTurnstileToken} onError={() => setTurnstileToken(undefined)} onExpire={() => setTurnstileToken(undefined)} />

          <SketchyButton className="w-full py-3 text-base" disabled={loading || (!!siteKey && !turnstileToken)} type="submit">
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </SketchyButton>
        </form>

        {previewUrl ? (
          <AuthNotice tone="info">
            Development preview link:{' '}
            <a className="font-semibold underline" href={previewUrl}>
              open reset link
            </a>
          </AuthNotice>
        ) : null}
      </div>
    </AuthShell>
  );
}
