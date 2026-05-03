import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import {
  AuthField,
  AuthNotice,
  AuthShell,
} from '../../features/auth/AuthShell';
import { getPostAuthPath, sanitizeInternalPath } from '../../features/auth/auth-routing';
import { completeMfaChallenge } from '../../services/auth.service';

function addVerifiedFlag(path: string) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}verified=1`;
}

export default function MfaChallengePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser, setAuthStateFromResponse } = useAuth();
  const { success, error: showError } = useToast();
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);

  const challengeId = searchParams.get('challengeId')?.trim() ?? '';
  const reason = searchParams.get('reason')?.trim();
  const returnTo = sanitizeInternalPath(searchParams.get('returnTo'));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!challengeId) {
      showError('This verification step is missing a challenge ID.');
      return;
    }

    setLoading(true);

    try {
      const response = await completeMfaChallenge({
        challengeId,
        ...(recoveryCode.trim() ? { recoveryCode: recoveryCode.trim() } : { code }),
      });

      if (response.user) {
        setAuthStateFromResponse(response);
        success('Verification complete.');
        navigate(returnTo ?? getPostAuthPath(response), { replace: true });
        return;
      }

      await refreshUser();
      success('Verification complete.');
      navigate(returnTo ? addVerifiedFlag(returnTo) : '/auth/security?verified=1', { replace: true });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to complete verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Multi-Factor Verification"
      title={reason === 'sensitive_action' ? 'Approve this sensitive action.' : 'Verify this sign-in.'}
      description={
        reason === 'sensitive_action'
          ? 'Enter a 6-digit authenticator code or a recovery code before continuing with this protected action.'
          : 'We detected a higher-risk sign-in. Enter a 6-digit authenticator code or use a recovery code to continue.'
      }
      footer={(
        <p className="text-sm text-black/60">
          Need to set up MFA first?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/security?setup=1">
            Open security settings
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {!challengeId ? (
          <AuthNotice tone="danger">This verification request is missing or expired.</AuthNotice>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            autoComplete="one-time-code"
            hint="Use the current 6-digit code from your authenticator app."
            label="Authenticator Code"
            maxLength={6}
            name="code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            type="text"
            value={code}
          />
          <AuthField
            hint="You can use a recovery code instead of a live authenticator code."
            label="Recovery Code"
            name="recoveryCode"
            onChange={(event) => setRecoveryCode(event.target.value)}
            placeholder="XXXX-XXXX"
            type="text"
            value={recoveryCode}
          />

          <SketchyButton className="w-full py-3 text-base" disabled={loading || !challengeId} type="submit">
            {loading ? 'Verifying...' : 'Continue securely'}
          </SketchyButton>
        </form>
      </div>
    </AuthShell>
  );
}
