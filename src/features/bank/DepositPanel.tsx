import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { ArrowDownRight, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { CopyField } from '../../components/ui/CopyField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { createDepositMemo, prepareTonConnectDeposit } from '../../services/transactions.service';
import type { DepositMemoDTO } from '../../types/api';
import { formatMoneyValue, normalizeFixedScaleAmount } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';

const DEPOSIT_AMOUNT_ID = 'deposit-amount';
const DEPOSIT_ADDRESS_ID = 'deposit-address';
const DEPOSIT_MEMO_ID = 'deposit-memo';
const WALLET_CONNECT_REQUIRED_ID = 'wallet-connect-required';

type DepositStep = 'amount' | 'review' | 'details' | 'pending';

interface DepositPanelProps {
  onBackToBank: () => void;
  onViewHistory: () => void;
}

interface PaymentDetails {
  data: DepositMemoDTO;
  amountUsdt: string;
}

function getExpiryState(expiresAt?: string): { expired: boolean; label: string | null } {
  if (!expiresAt) {
    return { expired: false, label: null };
  }

  const expiryTime = Date.parse(expiresAt);
  if (!Number.isFinite(expiryTime)) {
    return { expired: false, label: null };
  }

  const remainingMs = expiryTime - Date.now();
  if (remainingMs <= 0) {
    return { expired: true, label: 'Deposit expired' };
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = hours > 0
    ? `Expires in ${hours}h ${minutes}m`
    : `Expires in ${minutes}m`;

  return { expired: false, label };
}

const DepositPanel = ({ onBackToBank, onViewHistory }: DepositPanelProps) => {
  const [step, setStep] = useState<DepositStep>('amount');
  const [depositAmount, setDepositAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reviewAmount, setReviewAmount] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [sendingTransaction, setSendingTransaction] = useState(false);
  const [expiryTick, setExpiryTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const connectedWalletAddress = useTonAddress();
  const copyToClipboard = useCopyToClipboard();
  const { addToast } = useToast();

  useEffect(() => {
    if (!paymentDetails?.data.expiresAt || step !== 'details') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setExpiryTick((currentTick) => currentTick + 1);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [paymentDetails?.data.expiresAt, step]);

  const expiryState = useMemo(() => {
    void expiryTick;
    return getExpiryState(paymentDetails?.data.expiresAt);
  }, [expiryTick, paymentDetails?.data.expiresAt]);

  const displayAmount = reviewAmount ?? paymentDetails?.amountUsdt ?? null;

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  const validateDepositAmount = () => {
    try {
      const normalizedAmount = normalizeFixedScaleAmount(depositAmount, {
        scale: 6,
        allowZero: false,
        label: 'Deposit amount',
      });
      setAmountError(null);
      return normalizedAmount;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enter a valid deposit amount.';
      setAmountError(message);
      return null;
    }
  };

  const handleAmountChange = (value: string) => {
    setDepositAmount(value);
    setAmountError(null);
    setReviewAmount(null);
    setPaymentDetails(null);
    if (step !== 'amount') {
      setStep('amount');
    }
  };

  const handleReviewDeposit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedAmount = validateDepositAmount();
    if (!normalizedAmount) {
      return;
    }

    setReviewAmount(normalizedAmount);
    setPaymentDetails(null);
    setStep('review');
  };

  const handleGeneratePaymentDetails = async () => {
    const amountUsdt = reviewAmount ?? validateDepositAmount();
    if (!amountUsdt) {
      return;
    }

    setLoadingDetails(true);

    try {
      const data = await createDepositMemo();
      setPaymentDetails({ data, amountUsdt });
      setStep('details');
      addToast('Payment details ready.', 'success');
    } catch (error) {
      addToast(getApiErrorMessage(error, 'Could not prepare payment details.'), 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDepositTonConnect = async () => {
    if (!wallet || !connectedWalletAddress) {
      addToast('Connect your wallet first.', 'error');
      return;
    }

    if (!paymentDetails) {
      addToast('Generate payment details first.', 'error');
      return;
    }

    if (expiryState.expired) {
      addToast('These payment details expired.', 'error');
      return;
    }

    setSendingTransaction(true);

    try {
      const prepared = await prepareTonConnectDeposit({
        memo: paymentDetails.data.memo,
        walletAddress: connectedWalletAddress,
        amountUsdt: paymentDetails.amountUsdt,
      });

      await tonConnectUI.sendTransaction(prepared.transaction);
      setStep('pending');
      addToast('Transaction sent.', 'success');
    } catch (error) {
      addToast(getApiErrorMessage(error, 'Transaction failed. Please try again.'), 'error');
    } finally {
      setSendingTransaction(false);
    }
  };

  const renderAmountStep = () => (
    <form className="space-y-6" onSubmit={handleReviewDeposit}>
      <div>
        <label
          className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-50"
          htmlFor={DEPOSIT_AMOUNT_ID}
        >
          Deposit Amount (USDT)
        </label>
        <div className="relative">
          <input
            className="w-full border-b-2 border-black/20 bg-transparent p-2 pr-20 text-4xl font-bold transition-colors focus:border-black"
            id={DEPOSIT_AMOUNT_ID}
            inputMode="decimal"
            onChange={(event) => handleAmountChange(event.target.value)}
            placeholder="0.00"
            type="text"
            value={depositAmount}
          />
          <span className="absolute bottom-3 right-2 text-xl font-bold opacity-30">USDT</span>
        </div>
        {amountError ? (
          <p className="mt-2 text-sm font-bold text-danger-text" role="alert">
            {amountError}
          </p>
        ) : null}
      </div>

      <div className="rough-border bg-info-bg p-4 text-info-text">
        <p className="text-sm font-bold">
          Enter the amount first. We will generate the deposit address and required memo/comment after you review it.
        </p>
      </div>

      <SketchyButton className="w-full py-4 text-xl" type="submit">
        Review Deposit
      </SketchyButton>
    </form>
  );

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <StatusBadge tone="info">Ready to review</StatusBadge>
          <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">Review Deposit</h3>
        </div>
        <SketchyButton onClick={() => setStep('amount')} type="button" variant="secondary">
          Change amount
        </SketchyButton>
      </div>

      <div className="grid gap-3 bg-black/5 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-50">Amount</p>
          <p className="text-2xl font-bold text-ink-blue">{displayAmount} USDT</p>
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
          <p className="text-xs font-bold uppercase tracking-widest opacity-50">Method</p>
          <p className="text-xl font-bold">TonConnect or manual wallet</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SketchyButton
          className="w-full py-4 text-lg"
          disabled={loadingDetails}
          onClick={handleGeneratePaymentDetails}
          type="button"
        >
          {loadingDetails ? 'Preparing...' : 'Generate payment details'}
        </SketchyButton>
        <SketchyButton className="w-full py-4 text-lg" onClick={onBackToBank} type="button" variant="secondary">
          Cancel
        </SketchyButton>
      </div>
    </div>
  );

  const renderDetailsStep = () => {
    if (!paymentDetails) {
      return renderAmountStep();
    }

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <StatusBadge tone={expiryState.expired ? 'danger' : 'success'}>
              {expiryState.expired ? 'Deposit expired' : 'Payment details ready'}
            </StatusBadge>
            <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">
              Send exactly {formatMoneyValue(paymentDetails.amountUsdt, 6)} USDT
            </h3>
          </div>
          <SketchyButton onClick={() => setStep('amount')} type="button" variant="secondary">
            Change amount
          </SketchyButton>
        </div>

        <div className="rough-border bg-warning-bg p-4 text-warning-text">
          <p className="text-sm font-bold">
            Include this memo so we can credit your deposit automatically. Deposits sent without the memo may require manual review.
          </p>
        </div>

        <div className="grid gap-3 bg-black/5 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Amount</p>
            <p className="text-xl font-bold text-ink-blue">{formatMoneyValue(paymentDetails.amountUsdt, 6)} USDT</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Network</p>
            <p className="text-xl font-bold">TON</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Asset</p>
            <p className="text-xl font-bold">USDT</p>
          </div>
        </div>

        <div className="space-y-4">
          <CopyField
            id={DEPOSIT_ADDRESS_ID}
            label="Deposit Address"
            onCopy={() => void copyToClipboard(paymentDetails.data.address)}
            value={paymentDetails.data.address}
          />
          <CopyField
            id={DEPOSIT_MEMO_ID}
            label="Required memo/comment"
            onCopy={() => void copyToClipboard(paymentDetails.data.memo)}
            value={paymentDetails.data.memo}
            valueClassName="border-success-border bg-success-bg text-success-text"
          />
        </div>

        <div className="flex items-center justify-center gap-2 text-sm font-mono font-bold opacity-60">
          {expiryState.expired ? (
            <Clock size={16} className="text-danger-text" />
          ) : (
            <CheckCircle size={16} className="text-success-text" />
          )}
          <span aria-live="polite">{expiryState.label ?? `Expires in ${paymentDetails.data.expiresIn}`}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SketchyButton
            aria-describedby={!wallet ? WALLET_CONNECT_REQUIRED_ID : undefined}
            className="w-full py-4 text-lg text-white"
            disabled={!wallet || sendingTransaction || expiryState.expired}
            fill={!wallet || sendingTransaction || expiryState.expired ? '#d1d5db' : 'var(--color-ink-blue)'}
            onClick={handleDepositTonConnect}
            type="button"
          >
            {sendingTransaction ? 'Waiting for wallet...' : 'Pay with TonConnect'}
          </SketchyButton>
          <SketchyButton className="w-full py-4 text-lg" onClick={onBackToBank} type="button" variant="secondary">
            Cancel
          </SketchyButton>
        </div>

        {!wallet ? (
          <p className="text-center text-sm font-bold text-danger-text" id={WALLET_CONNECT_REQUIRED_ID}>
            Connect your wallet to pay with TonConnect, or copy the address and memo for a manual wallet deposit.
          </p>
        ) : null}
      </div>
    );
  };

  const renderPendingStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto rough-border flex size-16 items-center justify-center bg-warning-bg">
        <Clock size={32} className="text-warning-text" />
      </div>
      <div>
        <StatusBadge tone="warning">Awaiting confirmation</StatusBadge>
        <h3 className="mt-3 text-2xl font-semibold uppercase tracking-tight">Transaction sent</h3>
        <p className="mt-2 text-sm font-bold opacity-70">
          {paymentDetails ? `${formatMoneyValue(paymentDetails.amountUsdt, 6)} USDT is on the way.` : 'Your deposit is on the way.'}
          {' '}Your balance will update once the deposit is confirmed.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SketchyButton className="w-full py-4" onClick={onViewHistory} type="button">
          View transaction history
        </SketchyButton>
        <SketchyButton className="w-full py-4" onClick={onBackToBank} type="button" variant="secondary">
          Return to Bank
        </SketchyButton>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl scroll-mt-24" ref={panelRef}>
      <div className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="rough-border flex size-16 items-center justify-center bg-success-bg">
              <ArrowDownRight size={32} className="text-success-text" />
            </div>
            <div>
              <h2 className="text-3xl font-semibold italic uppercase tracking-tighter">Deposit USDT</h2>
              <p className="text-sm font-mono opacity-60">USDT on TON with a required memo/comment</p>
            </div>
          </div>
          <div className="shrink-0 sm:pt-1">
            <TonConnectButton />
          </div>
        </div>

        {step === 'amount' ? renderAmountStep() : null}
        {step === 'review' ? renderReviewStep() : null}
        {step === 'details' ? renderDetailsStep() : null}
        {step === 'pending' ? renderPendingStep() : null}
      </div>
    </div>
  );
};

export default DepositPanel;
