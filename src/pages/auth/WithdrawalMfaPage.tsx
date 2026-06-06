import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { SketchyButton } from '../../components/SketchyButton';
import { useToast } from '../../app/ToastProvider';
import {
  AuthField,
  AuthNotice,
  AuthShell,
} from '../../features/auth/AuthShell';
import { sanitizeInternalPath } from '../../features/auth/auth-routing';
import { formatWalletAddressForDisplay } from '../../features/bank/walletAddressPresentation';
import { completeMfaChallenge } from '../../services/auth.service';
import { getApiErrorMessage } from '../../utils/errors';

interface WithdrawalDraftDetails {
  amount: string | null;
  address: string | null;
}

function loadWithdrawalDraftDetails(): WithdrawalDraftDetails {
  try {
    return {
      amount: sessionStorage.getItem('withdrawal_draft_amount'),
      address: sessionStorage.getItem('withdrawal_draft_address'),
    };
  } catch {
    return { amount: null, address: null };
  }
}

export default function WithdrawalMfaPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);

  const challengeId = searchParams.get('challengeId')?.trim() ?? '';
  const withdrawalIntentId = searchParams.get('withdrawalIntentId')?.trim() ?? '';
  const returnTo = sanitizeInternalPath(searchParams.get('returnTo')) ?? '/bank';

  // Read display context from sessionStorage only (never used as the authorization source of truth)
  const [draftDetails] = useState(loadWithdrawalDraftDetails);
  const draftAmount = draftDetails.amount;
  const draftAddress = draftDetails.address;
  const draftAddressDisplay = formatWalletAddressForDisplay(draftAddress);

  const returnToBank = (status: 'verified' | 'failed' | 'cancelled', intentId?: string) => {
    const returnUrl = new URL(returnTo, 'http://4real.local');
    returnUrl.searchParams.set('view', 'withdraw');
    returnUrl.searchParams.set('flow', 'withdrawal');
    returnUrl.searchParams.set('mfa', status);
    if (intentId) {
      returnUrl.searchParams.set('withdrawalIntentId', intentId);
    }
    navigate(`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`, { replace: true });
  };

  const handleCancel = () => {
    try {
      sessionStorage.removeItem('withdrawal_draft_amount');
      sessionStorage.removeItem('withdrawal_draft_address');
    } catch {
      // Ignore
    }
    returnToBank('cancelled');
  };

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

      success('Withdrawal identity verification complete.');
      // Pass the verified withdrawalIntentId back to the bank page
      returnToBank('verified', response.withdrawalIntentId || withdrawalIntentId);
    } catch (error) {
      showError(getApiErrorMessage(error, 'Unable to complete verification.'));
      returnToBank('failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Transaction Security"
      title="Confirm Withdrawal"
      description="You are verifying a pending withdrawal. Please confirm the details and enter your authentication code."
      footer={(
        <p className="text-sm text-black/60">
          Suspect suspicious activity?{' '}
          <Link className="font-semibold text-ink-blue hover:underline" to="/auth/security">
            Check security settings
          </Link>
          .
        </p>
      )}
    >
      <div className="space-y-6">
        {!challengeId || !withdrawalIntentId ? (
          <AuthNotice tone="danger">
            This withdrawal confirmation session is invalid or expired. Please return to the bank page and try again.
          </AuthNotice>
        ) : null}

        {draftAmount && draftAddress ? (
          <div className="border-2 border-warning-border bg-warning-bg p-4 shadow-[4px_4px_0px_0px_var(--color-ink-black)] text-warning-text">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-warning-text">
              <AlertTriangle size={16} />
              Transaction Details
            </h4>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between border-b border-black/10 pb-1">
                <span className="text-black/60">Amount:</span>
                <span className="font-bold text-sm">{draftAmount} USDT</span>
              </div>
              <div className="space-y-1 pt-0.5" title={draftAddressDisplay}>
                <span className="text-black/60">To Wallet:</span>
                <span className="block break-all font-bold">{draftAddressDisplay}</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-warning-text font-sans">
              <strong>CRITICAL WARNING:</strong> Verify the destination wallet address precisely. Blockchain transfers are permanent and cannot be reversed.
            </p>
          </div>
        ) : (
          <AuthNotice tone="warning">
            Withdrawal details draft is not cached locally, but the transaction remains pending on the server.
          </AuthNotice>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            autoComplete="one-time-code"
            hint="The 6-digit code from your authenticator app."
            label="Authenticator Code"
            maxLength={6}
            name="code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            type="text"
            value={code}
          />
          <AuthField
            hint="Use this if you don't have access to your authenticator app."
            label="Recovery Code"
            name="recoveryCode"
            onChange={(event) => setRecoveryCode(event.target.value)}
            placeholder="XXXX-XXXX"
            type="text"
            value={recoveryCode}
          />

          <SketchyButton className="w-full py-3 text-base" disabled={loading || !challengeId} type="submit">
            {loading ? 'Verifying...' : 'Authorize & Submit'}
          </SketchyButton>

          <SketchyButton
            className="w-full py-3 text-base"
            disabled={loading}
            onClick={handleCancel}
            type="button"
            variant="secondary"
          >
            Cancel Transaction
          </SketchyButton>
        </form>
      </div>
    </AuthShell>
  );
}
