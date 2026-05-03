import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { resetPassword } from '../../services/auth.service';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const { success, error: showError } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = useMemo(
    () => confirmPassword.length === 0 || password === confirmPassword,
    [confirmPassword, password],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      showError('That reset link is missing a token.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Your password confirmation does not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await resetPassword({ token, password });
      success(response.message ?? 'Password updated.');
      navigate('/auth/login', { replace: true });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Reset Password"
      title="Replace your password and revoke old sessions."
      description="Successful reset revokes existing sessions so you can sign in again with the new password."
      footer={(
        <p className="text-sm text-black/60">
          Need a new link?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/forgot-password">
            Request another reset email
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {!token ? (
          <AuthNotice tone="danger">That reset link is missing or malformed.</AuthNotice>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            autoComplete="new-password"
            label="New Password"
            maxLength={128}
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 12 characters"
            required
            type="password"
            value={password}
          />
          <AuthField
            autoComplete="new-password"
            error={!passwordsMatch ? 'Passwords do not match.' : undefined}
            label="Confirm Password"
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter your new password"
            required
            type="password"
            value={confirmPassword}
          />

          <SketchyButton className="w-full py-3 text-base" disabled={loading || !passwordsMatch || !token} type="submit">
            {loading ? 'Resetting password...' : 'Save new password'}
          </SketchyButton>
        </form>
      </div>
    </AuthShell>
  );
}
