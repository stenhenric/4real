import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { ArrowUpRight, Clock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { CopyField } from '../../components/ui/CopyField';
import { ReadonlyField } from '../../components/ui/ReadonlyField';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { createWithdrawal, getWithdrawalStatus } from '../../services/transactions.service';
import type { WithdrawalRequestAcceptedDTO, WithdrawalStatusDTO } from '../../types/api';
import { formatMoneyValue, normalizeFixedScaleAmount } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';
import { createIdempotencyKey } from '../../utils/idempotency';
import {
  buildWithdrawalMfaReturnPath,
  clearWithdrawalResumeDraft,
  createWithdrawalResumeDraft,
  getBrowserSessionStorage,
  loadWithdrawalResumeDraft,
  saveWithdrawalResumeDraft,
} from './withdrawalResume';

const WITHDRAW_AMOUNT_ID = 'withdraw-amount';
const WITHDRAW_ADDRESS_ID = 'withdraw-address';
const WITHDRAW_DESTINATION_REVIEW_ID = 'withdraw-destination-review';
const WITHDRAWAL_MFA_RESULTS = new Set(['verified', 'failed', 'cancelled']);

type WithdrawStep = 'form' | 'review' | 'status';

interface WithdrawPanelProps {
  onBackToBank: () => void;
  onViewHistory: () => void;
}

interface WithdrawalFieldErrors {
  amount?: string;
  toAddress?: string;
}

const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatusDTO['status'], string> = {
  queued: 'Withdrawal queued',
  processing: 'Processing withdrawal',
  sent: 'Sent to network',
  confirmed: 'Confirmed',
  stuck: 'Delayed',
  failed: 'Failed',
};

function formatAddressPreview(address: string) {
  if (address.length <= 18) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function validateTonAddress(value: string) {
  return /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/.test(value.trim());
}

function getStatusMessage(status: WithdrawalStatusDTO['status']) {
  switch (status) {
    case 'queued':
      return 'Your balance has been reserved and the withdrawal is waiting for processing.';
    case 'processing':
      return 'We are preparing your withdrawal for the TON network.';
    case 'sent':
      return 'Your withdrawal was sent to the TON network and is waiting for final confirmation.';
    case 'confirmed':
      return 'Your withdrawal is confirmed.';
    case 'stuck':
      return 'This withdrawal is taking longer than expected and is under review.';
    case 'failed':
      return 'This withdrawal failed. Any held balance was refunded.';
    default:
      return 'We are tracking this withdrawal.';
  }
}

const WithdrawPanel = ({ onBackToBank, onViewHistory }: WithdrawPanelProps) => {
  const { userData, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const wallet = useTonWallet();
  const connectedWalletAddress = useTonAddress();
  const copyToClipboard = useCopyToClipboard();
  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState<WithdrawalFieldErrors>({});
  const [reviewAmount, setReviewAmount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedWithdrawal, setAcceptedWithdrawal] = useState<WithdrawalRequestAcceptedDTO | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<WithdrawalStatusDTO | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resumeAttemptedRef = useRef(false);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (connectedWalletAddress && step === 'form' && toAddress.trim().length === 0) {
      setToAddress(connectedWalletAddress);
    }
  }, [connectedWalletAddress, step, toAddress]);

  const refreshWithdrawalStatus = useCallback(async (signal?: AbortSignal) => {
    if (!acceptedWithdrawal) {
      return;
    }

    try {
      const nextStatus = await getWithdrawalStatus(acceptedWithdrawal.withdrawalId, signal);
      if (signal?.aborted) {
        return;
      }
      setWithdrawalStatus(nextStatus);
      setStatusError(null);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      setStatusError(getApiErrorMessage(error, 'Status updates are temporarily unavailable.'));
    }
  }, [acceptedWithdrawal]);

  useEffect(() => {
    if (!acceptedWithdrawal) {
      return undefined;
    }

    const controller = new AbortController();

    const refreshStatus = async () => {
      try {
        const nextStatus = await getWithdrawalStatus(acceptedWithdrawal.withdrawalId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setWithdrawalStatus(nextStatus);
        setStatusError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setStatusError(getApiErrorMessage(error, 'Status updates are temporarily unavailable.'));
      }
    };

    void refreshStatus();
    const intervalId = window.setInterval(() => {
      const currentStatus = withdrawalStatus?.status;
      if (currentStatus && ['confirmed', 'failed', 'stuck'].includes(currentStatus)) {
        return;
      }
      void refreshStatus();
    }, 5000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [acceptedWithdrawal, withdrawalStatus?.status]);

  const normalizedDestination = toAddress.trim();
  const statusForDisplay = withdrawalStatus ?? (acceptedWithdrawal && reviewAmount ? {
    withdrawalId: acceptedWithdrawal.withdrawalId,
    status: acceptedWithdrawal.status,
    amountUsdt: reviewAmount,
    toAddress: normalizedDestination,
    createdAt: new Date().toISOString(),
  } satisfies WithdrawalStatusDTO : null);

  const validateForm = () => {
    const nextErrors: WithdrawalFieldErrors = {};
    let normalizedAmount: string | null = null;

    try {
      normalizedAmount = normalizeFixedScaleAmount(amount, {
        scale: 6,
        allowZero: false,
        label: 'Withdrawal amount',
      });
    } catch (error) {
      nextErrors.amount = error instanceof Error ? error.message : 'Enter a valid withdrawal amount.';
    }

    if (!normalizedDestination) {
      nextErrors.toAddress = 'Enter a TON destination address.';
    } else if (!validateTonAddress(normalizedDestination)) {
      nextErrors.toAddress = 'Enter a valid TON address.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && normalizedAmount
      ? normalizedAmount
      : null;
  };

  const handleReviewWithdrawal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedAmount = validateForm();
    if (!normalizedAmount) {
      return;
    }

    setStatusError(null);
    setReviewAmount(normalizedAmount);
    setStep('review');
  };

  const handleFieldChange = (field: 'amount' | 'toAddress', value: string) => {
    if (field === 'amount') {
      setAmount(value);
    } else {
      setToAddress(value);
    }

    setStatusError(null);
    setFieldErrors((currentErrors) => ({ ...currentErrors, [field]: undefined }));
    if (step !== 'form') {
      setAcceptedWithdrawal(null);
      setWithdrawalStatus(null);
      setStep('form');
    }
  };

  const submitWithdrawal = useCallback(async (
    normalizedAmount: string,
    destination: string,
    idempotencyKey: string,
  ) => {
    setLoading(true);

    try {
      const response = await createWithdrawal(
        { amountUsdt: normalizedAmount, toAddress: destination },
        { idempotencyKey },
      );
      const storage = getBrowserSessionStorage();
      if (storage) {
        clearWithdrawalResumeDraft(storage);
      }
      setAcceptedWithdrawal(response);
      setWithdrawalStatus({
        withdrawalId: response.withdrawalId,
        status: response.status,
        amountUsdt: normalizedAmount,
        toAddress: destination,
        createdAt: new Date().toISOString(),
      });
      setStatusError(null);
      setStep('status');
      addToast('Withdrawal queued.', 'success');
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      addToast(getApiErrorMessage(error, 'Withdrawal failed. Please try again.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, refreshUser]);

  useEffect(() => {
    const storage = getBrowserSessionStorage();
    if (!storage) {
      return;
    }

    const resumeStatus = searchParams.get('mfa');
    const clearResumeStatus = () => {
      if (!resumeStatus || !WITHDRAWAL_MFA_RESULTS.has(resumeStatus)) {
        return;
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('mfa');
      setSearchParams(nextParams, { replace: true });
    };
    const result = loadWithdrawalResumeDraft(storage);

    if (result.status === 'expired' || result.status === 'invalid') {
      clearResumeStatus();
      setStep('form');
      setStatusError(result.message);
      addToast(result.message, 'error');
      return;
    }

    if (result.status !== 'ready') {
      return;
    }

    const { draft } = result;
    setAmount(draft.amountUsdt);
    setToAddress(draft.toAddress);
    setReviewAmount(draft.amountUsdt);
    setStep(draft.step);

    if (resumeStatus === 'failed') {
      clearResumeStatus();
      setStatusError('Verification failed. Your withdrawal details are still here.');
      addToast('Verification failed.', 'error');
      return;
    }

    if (resumeStatus === 'cancelled') {
      clearResumeStatus();
      setStatusError('Verification was cancelled. Your withdrawal details are still here.');
      addToast('Verification cancelled.', 'info');
      return;
    }

    if (resumeStatus === 'verified' && draft.resumeAfterMfa && !resumeAttemptedRef.current) {
      resumeAttemptedRef.current = true;
      clearResumeStatus();
      setStatusError(null);
      void submitWithdrawal(draft.amountUsdt, draft.toAddress, draft.idempotencyKey);
    }
  }, [addToast, searchParams, setSearchParams, submitWithdrawal]);

  const handleConfirmWithdrawal = async () => {
    const normalizedAmount = reviewAmount ?? validateForm();
    if (!normalizedAmount) {
      setStep('form');
      return;
    }

    const idempotencyKey = createIdempotencyKey();
    const storage = getBrowserSessionStorage();
    if (storage) {
      saveWithdrawalResumeDraft(storage, createWithdrawalResumeDraft({
        amountUsdt: normalizedAmount,
        toAddress: normalizedDestination,
        step: 'review',
        idempotencyKey,
      }));
    }

    window.history.replaceState(null, '', buildWithdrawalMfaReturnPath());
    await submitWithdrawal(normalizedAmount, normalizedDestination, idempotencyKey);
  };

  const balanceLabel = useMemo(() => formatMoneyValue(userData?.balance), [userData?.balance]);

  const renderFormStep = () => (
    <form className="space-y-6" onSubmit={handleReviewWithdrawal}>
      <div>
        <label
          className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-50"
          htmlFor={WITHDRAW_AMOUNT_ID}
        >
          Withdrawal Amount (USDT)
        </label>
        <div className="relative">
          <input
            className="w-full border-b-2 border-black/20 bg-transparent p-2 pr-20 text-4xl font-bold transition-colors focus:border-black"
            id={WITHDRAW_AMOUNT_ID}
            inputMode="decimal"
            onChange={(event) => handleFieldChange('amount', event.target.value)}
            placeholder="0.00"
            type="text"
            value={amount}
          />
          <span className="absolute bottom-3 right-2 text-xl font-bold opacity-30">USDT</span>
        </div>
        {fieldErrors.amount ? (
          <p className="mt-2 text-sm font-bold text-danger-text" role="alert">
            {fieldErrors.amount}
          </p>
        ) : null}
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label
            className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-50"
            htmlFor={WITHDRAW_ADDRESS_ID}
          >
            Destination TON Address
          </label>
          {wallet && connectedWalletAddress ? (
            <SketchyButton
              className="mb-1 px-2 py-1 text-[10px] font-bold uppercase text-white"
              fill="var(--color-ink-blue)"
              onClick={() => handleFieldChange('toAddress', connectedWalletAddress)}
              type="button"
            >
              Auto-fill connected wallet
            </SketchyButton>
          ) : null}
        </div>
        <input
          className="w-full border-b-2 border-black/20 bg-transparent p-2 font-mono text-lg transition-colors focus:border-black"
          id={WITHDRAW_ADDRESS_ID}
          onChange={(event) => handleFieldChange('toAddress', event.target.value)}
          placeholder="EQ..."
          type="text"
          value={toAddress}
        />
        {fieldErrors.toAddress ? (
          <p className="mt-2 text-sm font-bold text-danger-text" role="alert">
            {fieldErrors.toAddress}
          </p>
        ) : null}
      </div>

      <SketchyButton className="mt-4 w-full py-4 text-xl" type="submit">
        Review Withdrawal
      </SketchyButton>
    </form>
  );

  const renderReviewStep = () => {
    if (!reviewAmount) {
      return renderFormStep();
    }

    const reviewAmountLabel = formatMoneyValue(reviewAmount, 6);

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <StatusBadge tone="info">Ready to review</StatusBadge>
            <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">Confirm withdrawal</h3>
          </div>
          <SketchyButton onClick={() => setStep('form')} type="button" variant="secondary">
            Edit details
          </SketchyButton>
        </div>

        <div className="grid gap-3 bg-black/5 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Amount</p>
            <p className="text-2xl font-bold text-ink-blue">{reviewAmountLabel} USDT</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Network</p>
            <p className="text-xl font-bold">TON</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Asset</p>
            <p className="text-xl font-bold">USDT</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Destination</p>
            <p className="font-mono text-lg font-bold">{formatAddressPreview(normalizedDestination)}</p>
          </div>
        </div>

        <CopyField
          id={WITHDRAW_DESTINATION_REVIEW_ID}
          label="Destination address"
          onCopy={() => void copyToClipboard(normalizedDestination)}
          value={normalizedDestination}
        />

        <div className="space-y-3 bg-white p-4 shadow-sm border-2 border-black/10">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold uppercase tracking-widest opacity-60">Network fee</span>
            <span className="font-bold">Covered by platform</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold uppercase tracking-widest opacity-60">Total deducted</span>
            <span className="font-bold">{reviewAmountLabel} USDT</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold uppercase tracking-widest opacity-60">Estimated received</span>
            <span className="font-bold">{reviewAmountLabel} USDT</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SketchyButton className="w-full py-4 text-lg" disabled={loading} onClick={handleConfirmWithdrawal} type="button">
            {loading ? 'Confirming...' : 'Confirm Withdrawal'}
          </SketchyButton>
          <SketchyButton className="w-full py-4 text-lg" onClick={onBackToBank} type="button" variant="secondary">
            Cancel
          </SketchyButton>
        </div>
      </div>
    );
  };

  const renderStatusStep = () => {
    if (!statusForDisplay || !acceptedWithdrawal) {
      return renderFormStep();
    }

    const label = WITHDRAWAL_STATUS_LABELS[statusForDisplay.status];

    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto rough-border flex size-16 items-center justify-center bg-warning-bg">
          <Clock size={32} className="text-warning-text" />
        </div>
        <div>
          <StatusBadge tone={statusToneFromStatus(statusForDisplay.status)}>{label}</StatusBadge>
          <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">{label}</h3>
          <p className="mt-2 text-sm font-bold opacity-70">{getStatusMessage(statusForDisplay.status)}</p>
          {statusForDisplay.lastError ? (
            <p className="mt-2 text-sm font-bold text-danger-text" role="alert">
              {statusForDisplay.lastError}
            </p>
          ) : null}
          {statusError ? (
            <p className="mt-2 text-sm font-bold text-warning-text" role="status">
              {statusError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 bg-black/5 p-4 text-left sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Amount</p>
            <p className="text-xl font-bold text-ink-blue">{formatMoneyValue(statusForDisplay.amountUsdt, 6)} USDT</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Destination</p>
            <p className="font-mono text-lg font-bold">{formatAddressPreview(statusForDisplay.toAddress)}</p>
          </div>
        </div>

        <ReadonlyField label="Withdrawal ID" value={statusForDisplay.withdrawalId} />

        <div className="grid gap-3 sm:grid-cols-3">
          <SketchyButton
            className="w-full py-3"
            onClick={() => {
              void refreshWithdrawalStatus();
            }}
            type="button"
          >
            Refresh status
          </SketchyButton>
          <SketchyButton className="w-full py-3" onClick={onViewHistory} type="button">
            View transaction history
          </SketchyButton>
          <SketchyButton className="w-full py-3" onClick={onBackToBank} type="button" variant="secondary">
            Return to Bank
          </SketchyButton>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl scroll-mt-24" ref={panelRef}>
      <div className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rough-border flex size-16 items-center justify-center bg-danger-bg">
              <ArrowUpRight size={32} className="text-danger-text" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold italic uppercase tracking-tighter">Withdraw USDT</h2>
              <p className="text-sm font-mono opacity-60">Send USDT from your balance to a TON wallet</p>
            </div>
          </div>
          <div className="shrink-0 sm:pt-1">
            <TonConnectButton />
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between bg-black/5 p-4 border border-black/10">
          <span className="text-sm font-bold uppercase tracking-widest opacity-60">Available Balance:</span>
          <span className="font-mono text-2xl font-bold text-ink-blue">{balanceLabel} USDT</span>
        </div>

        {statusError && step !== 'status' ? (
          <p className="mb-6 bg-warning-bg p-3 text-sm font-bold text-warning-text" role="status">
            {statusError}
          </p>
        ) : null}

        {step === 'form' ? renderFormStep() : null}
        {step === 'review' ? renderReviewStep() : null}
        {step === 'status' ? renderStatusStep() : null}
      </div>
    </div>
  );
};

export default WithdrawPanel;
