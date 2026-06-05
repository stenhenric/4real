import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type FormEvent, type RefObject, type ReactNode } from 'react';
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
import type { WithdrawRequestDTO, WithdrawalStatusDTO } from '../../types/api';
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
import { formatWalletAddressForCopy, formatWalletAddressForDisplay } from './walletAddressPresentation';
import {
  createInitialWithdrawalFlowState,
  withdrawalFlowReducer,
  type WithdrawStep,
  type WithdrawalFieldErrors,
  type WithdrawalFlowAction,
} from './withdrawalFlowReducer';

const WITHDRAW_AMOUNT_ID = 'withdraw-amount';
const WITHDRAW_ADDRESS_ID = 'withdraw-address';
const WITHDRAW_DESTINATION_REVIEW_ID = 'withdraw-destination-review';
const MIN_WITHDRAWAL_USDT = '1.500000';
const WITHDRAWAL_MFA_RESULTS = new Set(['verified', 'failed', 'cancelled']);

interface WithdrawPanelProps {
  onBackToBank: () => void;
  onViewHistory: () => void;
}

const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatusDTO['status'], string> = {
  queued: 'Withdrawal queued',
  processing: 'Processing withdrawal',
  sent: 'Sent to network',
  confirmed: 'Confirmed',
  stuck: 'Delayed',
  failed: 'Failed',
};

function shouldClearWithdrawalIdempotencyAfterError(error: unknown): boolean {
  return error instanceof ApiClientError
    && error.status >= 400
    && error.status < 500
    && ![408, 409, 429].includes(error.status);
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

function WithdrawalFormStep({
  amount,
  connectedWalletAddress,
  fieldErrors,
  onFieldChange,
  onSubmit,
  toAddress,
  walletConnected,
}: {
  amount: string;
  connectedWalletAddress: string;
  fieldErrors: WithdrawalFieldErrors;
  onFieldChange: (field: 'amount' | 'toAddress', value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  toAddress: string;
  walletConnected: boolean;
}) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
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
            onChange={(event) => onFieldChange('amount', event.target.value)}
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
        ) : (
          <p className="mt-2 text-xs font-bold uppercase tracking-widest opacity-50">
            Minimum withdrawal: {formatMoneyValue(MIN_WITHDRAWAL_USDT, 6)} USDT
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label
            className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-50"
            htmlFor={WITHDRAW_ADDRESS_ID}
          >
            Destination TON Address
          </label>
          {walletConnected && connectedWalletAddress ? (
            <SketchyButton
              className="mb-1 px-2 py-1 text-[10px] font-bold uppercase text-white"
              fill="var(--color-ink-blue)"
              onClick={() => onFieldChange('toAddress', connectedWalletAddress)}
              type="button"
            >
              Auto-fill connected wallet
            </SketchyButton>
          ) : null}
        </div>
        <input
          className="w-full border-b-2 border-black/20 bg-transparent p-2 font-mono text-lg transition-colors focus:border-black"
          id={WITHDRAW_ADDRESS_ID}
          onChange={(event) => onFieldChange('toAddress', event.target.value)}
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
}

function WithdrawalReviewStep({
  loading,
  normalizedDestination,
  onBackToBank,
  onConfirmWithdrawal,
  onCopyDestination,
  onEditDetails,
  reviewAmount,
}: {
  loading: boolean;
  normalizedDestination: string;
  onBackToBank: () => void;
  onConfirmWithdrawal: () => void;
  onCopyDestination: () => void;
  onEditDetails: () => void;
  reviewAmount: string;
}) {
  const reviewAmountLabel = formatMoneyValue(reviewAmount, 6);
  const destinationCopyValue = formatWalletAddressForCopy(normalizedDestination);
  const destinationDisplay = formatWalletAddressForDisplay(normalizedDestination);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <StatusBadge tone="info">Ready to review</StatusBadge>
          <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">Confirm withdrawal</h3>
        </div>
        <SketchyButton onClick={onEditDetails} type="button" variant="secondary">
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
          <p className="break-all font-mono text-lg font-bold">{destinationDisplay}</p>
        </div>
      </div>

      <CopyField
        id={WITHDRAW_DESTINATION_REVIEW_ID}
        label="Destination address"
        onCopy={onCopyDestination}
        displayValue={destinationDisplay}
        multilineValue
        value={destinationCopyValue}
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
        <SketchyButton className="w-full py-4 text-lg" disabled={loading} onClick={onConfirmWithdrawal} type="button">
          {loading ? 'Confirming...' : 'Confirm Withdrawal'}
        </SketchyButton>
        <SketchyButton className="w-full py-4 text-lg" onClick={onBackToBank} type="button" variant="secondary">
          Cancel
        </SketchyButton>
      </div>
    </div>
  );
}

function WithdrawalStatusStep({
  onBackToBank,
  onRefreshStatus,
  onViewHistory,
  statusError,
  statusForDisplay,
}: {
  onBackToBank: () => void;
  onRefreshStatus: () => void;
  onViewHistory: () => void;
  statusError: string | null;
  statusForDisplay: WithdrawalStatusDTO;
}) {
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
          <p className="break-all font-mono text-lg font-bold">{formatWalletAddressForDisplay(statusForDisplay.toAddress)}</p>
        </div>
      </div>

      <ReadonlyField label="Withdrawal ID" value={statusForDisplay.withdrawalId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <SketchyButton className="w-full py-3" onClick={onRefreshStatus} type="button">
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
}

function WithdrawalPanelShell({
  balanceLabel,
  children,
  panelRef,
  showStatusError,
  statusError,
}: {
  balanceLabel: string;
  children: ReactNode;
  panelRef: RefObject<HTMLDivElement | null>;
  showStatusError: boolean;
  statusError: string | null;
}) {
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

        {showStatusError && statusError ? (
          <p className="mb-6 bg-warning-bg p-3 text-sm font-bold text-warning-text" role="status">
            {statusError}
          </p>
        ) : null}

        {children}
      </div>
    </div>
  );
}

function WithdrawalStepContent({
  acceptedWithdrawalExists,
  amount,
  connectedWalletAddress,
  fieldErrors,
  loading,
  normalizedDestination,
  onBackToBank,
  onConfirmWithdrawal,
  onCopyDestination,
  onEditDetails,
  onFieldChange,
  onRefreshStatus,
  onReviewWithdrawal,
  onViewHistory,
  reviewAmount,
  statusError,
  statusForDisplay,
  step,
  toAddress,
  walletConnected,
}: {
  acceptedWithdrawalExists: boolean;
  amount: string;
  connectedWalletAddress: string;
  fieldErrors: WithdrawalFieldErrors;
  loading: boolean;
  normalizedDestination: string;
  onBackToBank: () => void;
  onConfirmWithdrawal: () => void;
  onCopyDestination: () => void;
  onEditDetails: () => void;
  onFieldChange: (field: 'amount' | 'toAddress', value: string) => void;
  onRefreshStatus: () => void;
  onReviewWithdrawal: (event: FormEvent<HTMLFormElement>) => void;
  onViewHistory: () => void;
  reviewAmount: string | null;
  statusError: string | null;
  statusForDisplay: WithdrawalStatusDTO | null;
  step: WithdrawStep;
  toAddress: string;
  walletConnected: boolean;
}) {
  const formStep = (
    <WithdrawalFormStep
      amount={amount}
      connectedWalletAddress={connectedWalletAddress}
      fieldErrors={fieldErrors}
      onFieldChange={onFieldChange}
      onSubmit={onReviewWithdrawal}
      toAddress={toAddress}
      walletConnected={walletConnected}
    />
  );

  if (step === 'form') {
    return formStep;
  }

  if (step === 'review') {
    return reviewAmount ? (
      <WithdrawalReviewStep
        loading={loading}
        normalizedDestination={normalizedDestination}
        onBackToBank={onBackToBank}
        onConfirmWithdrawal={onConfirmWithdrawal}
        onCopyDestination={onCopyDestination}
        onEditDetails={onEditDetails}
        reviewAmount={reviewAmount}
      />
    ) : formStep;
  }

  return statusForDisplay && acceptedWithdrawalExists ? (
    <WithdrawalStatusStep
      onBackToBank={onBackToBank}
      onRefreshStatus={onRefreshStatus}
      onViewHistory={onViewHistory}
      statusError={statusError}
      statusForDisplay={statusForDisplay}
    />
  ) : formStep;
}

function useWithdrawalStatusTracking({
  acceptedWithdrawal,
  dispatchFlow,
  terminalStatus,
}: {
  acceptedWithdrawal: { withdrawalId: string } | null;
  dispatchFlow: Dispatch<WithdrawalFlowAction>;
  terminalStatus: WithdrawalStatusDTO['status'] | undefined;
}) {
  const refreshWithdrawalStatus = useCallback(async (signal?: AbortSignal) => {
    if (!acceptedWithdrawal) {
      return;
    }

    try {
      const nextStatus = await getWithdrawalStatus(acceptedWithdrawal.withdrawalId, signal);
      if (signal?.aborted) {
        return;
      }
      dispatchFlow({ type: 'STATUS_RECEIVED', withdrawalStatus: nextStatus });
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      dispatchFlow({
        type: 'STATUS_FAILED',
        message: getApiErrorMessage(error, 'Status updates are temporarily unavailable.'),
      });
    }
  }, [acceptedWithdrawal, dispatchFlow]);

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
        dispatchFlow({ type: 'STATUS_RECEIVED', withdrawalStatus: nextStatus });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        dispatchFlow({
          type: 'STATUS_FAILED',
          message: getApiErrorMessage(error, 'Status updates are temporarily unavailable.'),
        });
      }
    };

    void refreshStatus();
    const intervalId = window.setInterval(() => {
      if (terminalStatus && ['confirmed', 'failed', 'stuck'].includes(terminalStatus)) {
        return;
      }
      void refreshStatus();
    }, 5000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [acceptedWithdrawal, dispatchFlow, terminalStatus]);

  return refreshWithdrawalStatus;
}

function processWithdrawalMfaResume({
  addToast,
  dispatchFlow,
  resumeAttemptedRef,
  searchParams,
  setSearchParams,
  submitWithdrawal,
}: {
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  dispatchFlow: Dispatch<WithdrawalFlowAction>;
  resumeAttemptedRef: { current: boolean };
  searchParams: URLSearchParams;
  setSearchParams: (nextInit: URLSearchParams, navigateOptions: { replace: boolean }) => void;
  submitWithdrawal: (
    normalizedAmount: string,
    destination: string,
    idempotencyKey: string,
    withdrawalIntentId?: string,
  ) => Promise<void>;
}) {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  const resumeStatus = searchParams.get('mfa');
  const withdrawalIntentId = searchParams.get('withdrawalIntentId');
  const clearResumeStatus = () => {
    if (!resumeStatus || !WITHDRAWAL_MFA_RESULTS.has(resumeStatus)) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('mfa');
    nextParams.delete('withdrawalIntentId');
    setSearchParams(nextParams, { replace: true });
  };
  const result = loadWithdrawalResumeDraft(storage);

  if (result.status === 'expired' || result.status === 'invalid') {
    clearResumeStatus();
    dispatchFlow({ type: 'RESET_TO_FORM', statusError: result.message });
    addToast(result.message, 'error');
    return;
  }

  if (result.status !== 'ready') {
    return;
  }

  const { draft } = result;

  if (resumeStatus === 'failed') {
    clearResumeStatus();
    dispatchFlow({
      type: 'MFA_FAILED',
      message: 'Verification failed. Your withdrawal details are still here.',
      amountUsdt: draft.amountUsdt,
      toAddress: draft.toAddress,
      step: draft.step,
    });
    addToast('Verification failed.', 'error');
    return;
  }

  if (resumeStatus === 'cancelled') {
    clearResumeStatus();
    dispatchFlow({
      type: 'MFA_CANCELLED',
      message: 'Verification was cancelled. Your withdrawal details are still here.',
      amountUsdt: draft.amountUsdt,
      toAddress: draft.toAddress,
      step: draft.step,
    });
    addToast('Verification cancelled.', 'info');
    return;
  }

  dispatchFlow({
    type: 'MFA_RESUME_READY',
    amountUsdt: draft.amountUsdt,
    toAddress: draft.toAddress,
    step: draft.step,
  });

  if (resumeStatus === 'verified' && draft.resumeAfterMfa && !resumeAttemptedRef.current) {
    resumeAttemptedRef.current = true;
    clearResumeStatus();
    void submitWithdrawal(draft.amountUsdt, draft.toAddress, draft.idempotencyKey, withdrawalIntentId || undefined);
  }
}

const WithdrawPanel = ({ onBackToBank, onViewHistory }: WithdrawPanelProps) => {
  const { userData, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const wallet = useTonWallet();
  const connectedWalletAddress = useTonAddress();
  const copyToClipboard = useCopyToClipboard();
  const [flowState, dispatchFlow] = useReducer(
    withdrawalFlowReducer,
    undefined,
    createInitialWithdrawalFlowState,
  );
  const {
    step,
    amount,
    toAddress,
    fieldErrors,
    reviewAmount,
    loading,
    acceptedWithdrawal,
    withdrawalStatus,
    statusError,
  } = flowState;
  const panelRef = useRef<HTMLDivElement>(null);
  const resumeAttemptedRef = useRef(false);
  const withdrawalRequestInFlightRef = useRef(false);
  const withdrawalActionRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (connectedWalletAddress) {
      dispatchFlow({ type: 'CONNECTED_WALLET_PREFILLED', toAddress: connectedWalletAddress });
    }
  }, [connectedWalletAddress, step, toAddress]);

  const refreshWithdrawalStatus = useWithdrawalStatusTracking({
    acceptedWithdrawal,
    dispatchFlow,
    terminalStatus: withdrawalStatus?.status,
  });

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
        min: MIN_WITHDRAWAL_USDT,
      });
    } catch (error) {
      nextErrors.amount = error instanceof Error ? error.message : 'Enter a valid withdrawal amount.';
    }

    if (!normalizedDestination) {
      nextErrors.toAddress = 'Enter a TON destination address.';
    } else if (!validateTonAddress(normalizedDestination)) {
      nextErrors.toAddress = 'Enter a valid TON address.';
    }

    if (Object.keys(nextErrors).length > 0) {
      dispatchFlow({ type: 'VALIDATION_FAILED', fieldErrors: nextErrors });
    }
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

    dispatchFlow({ type: 'REVIEW_READY', amountUsdt: normalizedAmount });
  };

  const handleFieldChange = (field: 'amount' | 'toAddress', value: string) => {
    dispatchFlow({ type: 'FIELD_CHANGED', field, value });
  };

  const submitWithdrawal = useCallback(async (
    normalizedAmount: string,
    destination: string,
    idempotencyKey: string,
    withdrawalIntentId?: string,
  ) => {
    if (withdrawalRequestInFlightRef.current) {
      return;
    }

    withdrawalRequestInFlightRef.current = true;
    dispatchFlow({ type: 'SUBMIT_STARTED' });

    try {
      const payload: WithdrawRequestDTO = {
        amountUsdt: normalizedAmount,
        toAddress: destination,
      };
      if (withdrawalIntentId) {
        payload.withdrawalIntentId = withdrawalIntentId;
      }
      const response = await createWithdrawal(
        payload,
        { idempotencyKey },
      );
      const storage = getBrowserSessionStorage();
      if (storage) {
        clearWithdrawalResumeDraft(storage);
        try {
          sessionStorage.removeItem('withdrawal_draft_amount');
          sessionStorage.removeItem('withdrawal_draft_address');
        } catch {
          // Ignore
        }
      }
      withdrawalActionRef.current = null;
      dispatchFlow({
        type: 'SUBMIT_ACCEPTED',
        acceptedWithdrawal: response,
        withdrawalStatus: {
          withdrawalId: response.withdrawalId,
          status: response.status,
          amountUsdt: normalizedAmount,
          toAddress: destination,
          createdAt: new Date().toISOString(),
        },
      });
      addToast('Withdrawal queued.', 'success');
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        try {
          sessionStorage.setItem('withdrawal_draft_amount', normalizedAmount);
          sessionStorage.setItem('withdrawal_draft_address', destination);
        } catch {
          // Ignore
        }
        dispatchFlow({ type: 'SUBMIT_FAILED' });
        return;
      }

      if (shouldClearWithdrawalIdempotencyAfterError(error)) {
        withdrawalActionRef.current = null;
      }
      dispatchFlow({ type: 'SUBMIT_FAILED' });
      addToast(getApiErrorMessage(error, 'Withdrawal failed. Please try again.'), 'error');
    } finally {
      withdrawalRequestInFlightRef.current = false;
    }
  }, [addToast, refreshUser]);

  useEffect(() => {
    processWithdrawalMfaResume({
      addToast,
      dispatchFlow,
      resumeAttemptedRef,
      searchParams,
      setSearchParams,
      submitWithdrawal,
    });
  }, [addToast, dispatchFlow, searchParams, setSearchParams, submitWithdrawal]);

  const handleConfirmWithdrawal = async () => {
    const normalizedAmount = reviewAmount ?? validateForm();
    if (!normalizedAmount) {
      dispatchFlow({ type: 'RESET_TO_FORM' });
      return;
    }

    const actionFingerprint = `${normalizedAmount}:${normalizedDestination}`;
    const currentAction = withdrawalActionRef.current?.fingerprint === actionFingerprint
      ? withdrawalActionRef.current
      : {
          fingerprint: actionFingerprint,
          idempotencyKey: createIdempotencyKey(),
        };
    withdrawalActionRef.current = currentAction;
    const storage = getBrowserSessionStorage();
    if (storage) {
      saveWithdrawalResumeDraft(storage, createWithdrawalResumeDraft({
        amountUsdt: normalizedAmount,
        toAddress: normalizedDestination,
        step: 'review',
        idempotencyKey: currentAction.idempotencyKey,
      }));
    }

    window.history.replaceState(null, '', buildWithdrawalMfaReturnPath());
    await submitWithdrawal(normalizedAmount, normalizedDestination, currentAction.idempotencyKey);
  };

  const balanceLabel = useMemo(() => formatMoneyValue(userData?.balance), [userData?.balance]);

  return (
    <WithdrawalPanelShell
      balanceLabel={balanceLabel}
      panelRef={panelRef}
      showStatusError={step !== 'status'}
      statusError={statusError}
    >
      <WithdrawalStepContent
        acceptedWithdrawalExists={Boolean(acceptedWithdrawal)}
        amount={amount}
        connectedWalletAddress={connectedWalletAddress}
        fieldErrors={fieldErrors}
        loading={loading}
        normalizedDestination={normalizedDestination}
        onBackToBank={onBackToBank}
        onConfirmWithdrawal={() => void handleConfirmWithdrawal()}
        onCopyDestination={() => void copyToClipboard(formatWalletAddressForCopy(normalizedDestination))}
        onEditDetails={() => dispatchFlow({ type: 'RESET_TO_FORM' })}
        onFieldChange={handleFieldChange}
        onRefreshStatus={() => void refreshWithdrawalStatus()}
        onReviewWithdrawal={handleReviewWithdrawal}
        onViewHistory={onViewHistory}
        reviewAmount={reviewAmount}
        statusError={statusError}
        statusForDisplay={statusForDisplay}
        step={step}
        toAddress={toAddress}
        walletConnected={Boolean(wallet)}
      />
    </WithdrawalPanelShell>
  );
};

export default WithdrawPanel;
