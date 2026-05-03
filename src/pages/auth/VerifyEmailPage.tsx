import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { useAuth } from '../../app/AuthProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { resendVerificationEmail } from '../../services/auth.service';

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
  const { userData } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { info, error: showError } = useToast();
  const initialEmail = searchParams.get('email')?.trim() || userData?.email || '';
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    ((location.state ?? null) as { previewUrl?: string } | null)?.previewUrl ?? null,
  );

  const errorMessage = useMemo(
    () => getVerificationError(searchParams.get('error')),
    [searchParams],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await resendVerificationEmail(email);
      setPreviewUrl(response.previewUrl ?? null);
      info(response.message ?? 'If the account exists, a verification email is on the way.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Verify Email"
      title="Activate your account before you play."
      description="Email verification is required before we issue a live app session. Open the link in your inbox, then return here."
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
        {errorMessage ? <AuthNotice tone="warning">{errorMessage}</AuthNotice> : null}
        <AuthNotice tone="info">
          The verification link opens your browser, activates the account, and redirects back into 4real.
        </AuthNotice>

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
