import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle, History, StickyNote, Upload } from 'lucide-react';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { formatDateTime } from '../merchant/format';
import {
  createOrder,
  getMerchantConfig,
  getOrders,
  updateOrderStatus,
} from '../../services/orders.service';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import { formatMoneyValue, moneyToNumber, normalizeFixedScaleAmount } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';
import { createIdempotencyKey } from '../../utils/idempotency';
import {
  formatP2pOrderReference,
  getP2pCompactSummary,
  getP2pOrderStatusLabel,
  getP2pTradeRequirements,
  getP2pTradeSummary,
  getPendingP2pOrders,
  isSellAmountWithinAvailableBalance,
} from './p2pPresentation';
import type { MerchantConfigDTO, OrderDTO } from '../../types/api';

type MerchantTab = 'buy' | 'sell';

const MERCHANT_AMOUNT_ID = 'merchant-amount';
const MERCHANT_PROOF_ID = 'merchant-proof';
const MERCHANT_TRANSACTION_CODE_ID = 'merchant-transaction-code';

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function formatMoney(value: string | number | null | undefined): string {
  return formatMoneyValue(value);
}

function shouldClearOrderIdempotencyAfterError(error: unknown): boolean {
  return error instanceof ApiClientError
    && error.status >= 400
    && error.status < 500
    && ![408, 409, 429].includes(error.status);
}

const MerchantPanel = () => {
  const { isAdmin, refreshUser, userData } = useAuth();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<MerchantTab>('buy');
  const [amount, setAmount] = useState('');
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [transactionCode, setTransactionCode] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [mpesaName, setMpesaName] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [merchantConfig, setMerchantConfig] = useState<MerchantConfigDTO | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const orderRequestInFlightRef = useRef(false);
  const orderActionRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadMerchantView = async () => {
      const [ordersResult, configResult] = await Promise.allSettled([
        getOrders(controller.signal),
        getMerchantConfig(controller.signal),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      let nextError: string | null = null;

      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value);
      } else if (!isAbortError(ordersResult.reason, controller.signal)) {
        setOrders([]);
        nextError = 'We could not load recent P2P trades. Your balance is unchanged.';
      }

      if (configResult.status === 'fulfilled') {
        setMerchantConfig(configResult.value);
      } else if (!isAbortError(configResult.reason, controller.signal)) {
        setMerchantConfig(null);
        nextError = 'We could not load M-Pesa trading details. Try again.';
      }

      setViewError(nextError);
      if (nextError) {
        showError(nextError);
      }
    };

    void loadMerchantView();

    return () => {
      controller.abort();
    };
  }, [reloadKey, showError]);

  const resetTradeForm = () => {
    setAmount('');
    setProofImage(null);
    setTransactionCode('');
    setPaymentConfirmed(false);
    setMpesaNumber('');
    setMpesaName('');
  };

  const handleTabChange = (nextTab: MerchantTab) => {
    setActiveTab(nextTab);
    resetTradeForm();
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(event.target.value);
    setProofImage(null);
    setTransactionCode('');
    setPaymentConfirmed(false);
  };

  const normalizedAmount = useMemo(() => {
    try {
      return normalizeFixedScaleAmount(amount, {
        scale: 6,
        allowZero: false,
        label: 'USDT amount',
      });
    } catch {
      return null;
    }
  }, [amount]);
  const hasValidAmount = normalizedAmount !== null;
  const amountValue = normalizedAmount ? moneyToNumber(normalizedAmount) : 0;
  const availableBalance = userData?.balance ?? '0';
  const pendingOrders = useMemo(() => getPendingP2pOrders(orders), [orders]);
  const activeRate = activeTab === 'buy'
    ? merchantConfig?.buyRateKesPerUsdt ?? 0
    : merchantConfig?.sellRateKesPerUsdt ?? 0;
  const activeRateValue = moneyToNumber(activeRate);
  const rateConfigured = activeRateValue > 0;
  const fiatTotal = hasValidAmount && rateConfigured
    ? roundMoney(amountValue * activeRateValue)
    : null;
  const fiatCurrency = merchantConfig?.fiatCurrency ?? 'KES';
  const sellAmountWithinAvailable = useMemo(
    () => isSellAmountWithinAvailableBalance(availableBalance, normalizedAmount),
    [availableBalance, normalizedAmount],
  );
  const buyReadyForSubmit = Boolean(
    hasValidAmount
    && rateConfigured
    && paymentConfirmed
    && transactionCode.trim().length > 0
    && proofImage,
  );

  const sellReadyForSubmit = Boolean(
    hasValidAmount
    && rateConfigured
    && sellAmountWithinAvailable
    && mpesaNumber.trim().length > 0
    && mpesaName.trim().length > 0
    && paymentConfirmed
  );
  const buyRequirements = useMemo(() => getP2pTradeRequirements({
    type: 'buy',
    hasValidAmount,
    rateConfigured,
    paymentConfirmed,
    hasTransactionCode: transactionCode.trim().length > 0,
    hasProofImage: Boolean(proofImage),
  }), [
    hasValidAmount,
    paymentConfirmed,
    proofImage,
    rateConfigured,
    transactionCode,
  ]);
  const sellRequirements = useMemo(() => getP2pTradeRequirements({
    type: 'sell',
    hasValidAmount,
    rateConfigured,
    hasMpesaNumber: mpesaNumber.trim().length > 0,
    hasMpesaName: mpesaName.trim().length > 0,
    sellAmountWithinAvailable,
  }), [
    hasValidAmount,
    mpesaName,
    mpesaNumber,
    rateConfigured,
    sellAmountWithinAvailable,
  ]);
  const compactSummary = useMemo(() => getP2pCompactSummary({
    availableBalance,
    pendingOrderCount: pendingOrders.length,
    merchantConfig,
  }), [availableBalance, merchantConfig, pendingOrders.length]);

  const buyInstructionTitle = useMemo(() => {
    if (!hasValidAmount || !rateConfigured) {
      return `Enter the amount of USDT you want to buy.`;
    }

    return `Pay ${formatMoney(fiatTotal)} ${fiatCurrency} to buy ${formatMoney(amountValue)} USDT.`;
  }, [amountValue, fiatCurrency, fiatTotal, hasValidAmount, rateConfigured]);

  const getOrderAction = (fingerprint: string) => {
    const currentAction = orderActionRef.current?.fingerprint === fingerprint
      ? orderActionRef.current
      : {
          fingerprint,
          idempotencyKey: createIdempotencyKey(),
        };
    orderActionRef.current = currentAction;
    return currentAction;
  };

  const handleOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (orderRequestInFlightRef.current) {
      return;
    }

    if (!hasValidAmount) {
      showError('Enter a valid USDT amount.');
      return;
    }

    if (!rateConfigured) {
      showError('P2P exchange rate is not configured yet.');
      return;
    }

    setLoading(true);

    try {
      if (!normalizedAmount) {
        throw new Error('Enter a valid USDT amount.');
      }

      if (activeTab === 'buy') {
        if (!paymentConfirmed) {
          throw new Error('Please confirm you have sent the payment first.');
        }

        if (!transactionCode.trim()) {
          throw new Error('Enter your M-Pesa transaction code.');
        }

        if (!proofImage) {
          throw new Error('Upload your payment screenshot before submitting.');
        }

        const currentAction = getOrderAction([
          'BUY',
          normalizedAmount,
          transactionCode.trim(),
          proofImage.name,
          proofImage.size,
          proofImage.lastModified,
        ].join(':'));
        orderRequestInFlightRef.current = true;
        const order = await createOrder({
          type: 'BUY',
          amount: normalizedAmount,
          transactionCode: transactionCode.trim(),
          proofImage,
        }, { idempotencyKey: currentAction.idempotencyKey });

        setOrders((currentOrders) => [order, ...currentOrders]);
        success('Buy order submitted.');
      } else {
        if (!paymentConfirmed) {
          throw new Error('Please review and confirm your details before submitting.');
        }
        if (!mpesaNumber.trim() || !mpesaName.trim()) {
          throw new Error('Please provide your M-Pesa details.');
        }
        if (!sellAmountWithinAvailable) {
          throw new Error('Sell amount must be within your available USDT balance.');
        }
        if (!/^(07\d{8}|254\d{9})$/.test(mpesaNumber.trim())) {
          throw new Error('Please enter a valid M-Pesa number (07XXXXXXXXX or 254XXXXXXXXX).');
        }

        const currentAction = getOrderAction([
          'SELL',
          normalizedAmount,
          mpesaNumber.trim(),
          mpesaName.trim(),
        ].join(':'));
        orderRequestInFlightRef.current = true;
        const order = await createOrder({
          type: 'SELL',
          amount: normalizedAmount,
          mpesaNumber: mpesaNumber.trim(),
          mpesaName: mpesaName.trim(),
        }, { idempotencyKey: currentAction.idempotencyKey });

        setOrders((currentOrders) => [order, ...currentOrders]);
        success('Sell order placed.');
      }

      orderActionRef.current = null;
      resetTradeForm();
      await refreshUser();
    } catch (error) {
      if (error instanceof Error && !(error instanceof ApiClientError)) {
        showError(error.message);
        return;
      }

      if (shouldClearOrderIdempotencyAfterError(error)) {
        orderActionRef.current = null;
      }
      showError(getApiErrorMessage(error, 'Could not submit P2P order. Please try again.'));
    } finally {
      setLoading(false);
      orderRequestInFlightRef.current = false;
    }
  };

  const handleStatusUpdate = async (orderId: string, nextStatus: OrderDTO['status']) => {
    try {
      const updatedOrder = await updateOrderStatus(orderId, nextStatus);
      setOrders((currentOrders) =>
        currentOrders.map((order) => (order._id === orderId ? updatedOrder : order)),
      );
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError('Failed to update status.');
    }
  };

  const renderRequirementList = (requirements: string[], readyMessage: string, id: string) => (
    <div
      className={cn(
        'rough-border p-4 text-sm font-bold',
        requirements.length > 0
          ? 'border-warning-border bg-warning-bg text-warning-text'
          : 'border-success-border bg-success-bg text-success-text',
      )}
      id={id}
      role={requirements.length > 0 ? 'status' : undefined}
    >
      {requirements.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em]">Before you continue</p>
          <ul className="space-y-1">
            {requirements.map((requirement) => (
              <li className="flex items-start gap-2" key={requirement}>
                <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <CheckCircle className="mt-0.5 shrink-0" size={16} />
          <span>{readyMessage}</span>
        </div>
      )}
    </div>
  );

  const renderProofUpload = () => (
    <div className="space-y-3">
      <label
        className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
        htmlFor={MERCHANT_PROOF_ID}
      >
        M-Pesa payment screenshot
      </label>
      <div className="rough-border relative min-h-[190px] overflow-hidden border-dashed border-black/30 bg-white text-center shadow-sm transition-colors hover:bg-warning-bg">
        <input
          accept="image/png,image/jpeg,image/webp"
          aria-describedby="merchant-proof-help"
          aria-label="Upload M-Pesa payment screenshot"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          id={MERCHANT_PROOF_ID}
          onChange={(event) => setProofImage(event.target.files?.[0] ?? null)}
          type="file"
        />
        <div className="pointer-events-none flex min-h-[190px] flex-col items-center justify-center p-6">
          <Upload className="opacity-40 mb-3" size={44} />
          <p className="text-sm italic opacity-80 font-bold uppercase tracking-widest">
            Upload payment screenshot
          </p>
          <p className="mt-3 text-xs font-mono opacity-65 max-w-xs" id="merchant-proof-help">
            PNG, JPG, or WEBP. Use the screenshot for the exact M-Pesa payment above.
          </p>
          <p className="mt-4 text-sm font-bold text-ink-blue break-all">
            {proofImage ? `Selected: ${proofImage.name}` : 'Choose screenshot'}
          </p>
        </div>
      </div>
    </div>
  );

  const renderMpesaInstructionContent = () => (
    <div className="space-y-4 font-mono text-sm leading-relaxed">
      <div className="border border-warning-border bg-white/40 p-3">
        <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">
          M-Pesa Till
        </p>
        <p className="font-bold text-xl tracking-tight italic">
          {merchantConfig?.mpesaNumber ?? 'Loading…'}
        </p>
      </div>
      <div className="border border-warning-border bg-white/40 p-3">
        <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">P2P USDT Wallet</p>
        <p className="font-bold break-all text-xs">
          {merchantConfig?.walletAddress ?? 'Loading…'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-success-border bg-white/40 p-3">
          <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">Buy Rate</p>
          <p className="font-bold text-lg tracking-tight">
            {merchantConfig ? `${formatMoney(merchantConfig.buyRateKesPerUsdt)} ${fiatCurrency}` : 'Loading…'}
          </p>
          <p className="text-[10px] opacity-50 mt-1">per 1 USDT</p>
        </div>
        <div className="border border-danger-border bg-white/40 p-3">
          <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">Sell Rate</p>
          <p className="font-bold text-lg tracking-tight">
            {merchantConfig ? `${formatMoney(merchantConfig.sellRateKesPerUsdt)} ${fiatCurrency}` : 'Loading…'}
          </p>
          <p className="text-[10px] opacity-50 mt-1">per 1 USDT</p>
        </div>
      </div>
      <p className="italic text-xs opacity-70 font-bold bg-white/20 p-2 whitespace-pre-wrap">
        {merchantConfig?.instructions ?? 'Loading P2P instructions…'}
      </p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold italic uppercase tracking-tighter sm:text-5xl">
          Buy or sell USDT with <span className="whitespace-nowrap">M-Pesa</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-mono font-bold uppercase tracking-widest opacity-60">
          Review the rate, confirm the details, and track your P2P orders here.
        </p>
      </div>

      <div className="rough-border bg-white/80 p-4 shadow-sm sm:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-50">Available USDT</p>
            <p className="mt-1 text-3xl font-bold text-ink-blue">{compactSummary.availableBalance}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-50">Pending</p>
            <p className="mt-1 text-2xl font-bold text-warning-text">{compactSummary.pendingOrders}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-black/10 pt-3 font-mono text-xs">
          <div>
            <dt className="font-bold uppercase tracking-widest text-success-text">Buy rate</dt>
            <dd className="mt-1 font-bold">{compactSummary.buyRate}</dd>
          </div>
          <div className="text-right">
            <dt className="font-bold uppercase tracking-widest text-danger-text">Sell rate</dt>
            <dd className="mt-1 font-bold">{compactSummary.sellRate}</dd>
          </div>
        </dl>
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        <div className="rough-border bg-white/80 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-50">Available USDT</p>
          <p className="mt-2 text-3xl font-bold text-ink-blue">{formatMoney(availableBalance)}</p>
        </div>
        <div className="rough-border bg-white/80 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-50">Pending P2P orders</p>
          <p className="mt-2 text-3xl font-bold text-warning-text">{pendingOrders.length}</p>
        </div>
        <div className="rough-border bg-success-bg p-4 text-success-text shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">Buy rate</p>
          <p className="mt-2 text-2xl font-bold">
            {merchantConfig ? `${formatMoney(merchantConfig.buyRateKesPerUsdt)} ${fiatCurrency}` : 'Loading…'}
          </p>
          <p className="text-xs font-bold opacity-70">per 1 USDT</p>
        </div>
        <div className="rough-border bg-danger-bg p-4 text-danger-text shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">Sell rate</p>
          <p className="mt-2 text-2xl font-bold">
            {merchantConfig ? `${formatMoney(merchantConfig.sellRateKesPerUsdt)} ${fiatCurrency}` : 'Loading…'}
          </p>
          <p className="text-xs font-bold opacity-70">per 1 USDT</p>
        </div>
      </div>

      {viewError ? (
        <div className="rough-border border-warning-border bg-warning-bg p-4 text-warning-text">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold">{viewError}</p>
            <SketchyButton
              className="w-full sm:w-auto"
              onClick={() => setReloadKey((currentKey) => currentKey + 1)}
              type="button"
              variant="secondary"
            >
              Retry
            </SketchyButton>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12">
        <div className="lg:col-span-7 flex flex-col gap-8">
          <div className="order-1 bg-white/80 p-4 shadow-xl lg:order-2">
            <div className="flex gap-4 mb-8" role="tablist" aria-label="P2P trade type">
              <SketchyButton
                aria-controls="merchant-buy-panel"
                aria-selected={activeTab === 'buy'}
                className={cn(
                  'flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter',
                  activeTab === 'buy' ? 'border-ink-black bg-black/5 scale-105' : 'border-transparent opacity-30',
                )}
                fill={activeTab === 'buy' ? 'var(--color-paper-soft)' : 'transparent'}
                id="merchant-buy-tab"
                onClick={() => handleTabChange('buy')}
                role="tab"
                type="button"
              >
                Buy USDT
              </SketchyButton>
              <SketchyButton
                aria-controls="merchant-sell-panel"
                aria-selected={activeTab === 'sell'}
                className={cn(
                  'flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter',
                  activeTab === 'sell' ? 'border-ink-black bg-black/5 scale-105' : 'border-transparent opacity-30',
                )}
                fill={activeTab === 'sell' ? 'var(--color-paper-soft)' : 'transparent'}
                id="merchant-sell-tab"
                onClick={() => handleTabChange('sell')}
                role="tab"
                type="button"
              >
                Sell USDT
              </SketchyButton>
            </div>

            <form
              aria-busy={loading}
              className="space-y-6"
              id={activeTab === 'buy' ? 'merchant-buy-panel' : 'merchant-sell-panel'}
              onSubmit={handleOrder}
              role="tabpanel"
            >
              <div>
                <label
                  className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                  htmlFor={MERCHANT_AMOUNT_ID}
                >
                  {activeTab === 'buy' ? 'Amount to Buy (USDT)' : 'Amount to Sell (USDT)'}
                </label>
                <div className="relative">
                  <input
                    className="w-full text-5xl font-bold bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                    id={MERCHANT_AMOUNT_ID}
                    inputMode="decimal"
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    required
                    step="0.01"
                    type="number"
                    value={amount}
                  />
                  <span className="absolute right-2 bottom-4 text-2xl opacity-20 font-bold">USDT</span>
                </div>
              </div>

              <div className="rough-border bg-paper-soft/80 p-5">
                {activeTab === 'buy' ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">
                        Step 1: Review exact payment
                      </p>
                      <p className="mt-2 text-2xl font-bold italic">{buyInstructionTitle}</p>
                      <p className="mt-2 text-sm font-mono opacity-70">
                        P2P rate: {rateConfigured ? `${formatMoney(activeRate)} ${fiatCurrency}/USDT` : 'P2P rate not configured'}
                      </p>
                    </div>

                    {hasValidAmount && rateConfigured ? (
                      <div className="rough-border border-warning-border bg-warning-bg p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-warning-text">
                          Payment summary
                        </p>
                        <p className="mt-3 text-3xl font-bold italic text-warning-text">
                          {formatMoney(fiatTotal)} {fiatCurrency}
                        </p>
                        <p className="mt-2 text-sm font-mono text-warning-text/80">
                          Send this exact amount to {merchantConfig?.mpesaNumber ?? 'this M-Pesa till'} before you continue.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-mono opacity-60">
                        Enter a valid amount to see the exact {fiatCurrency} total you need to pay.
                      </p>
                    )}

                    {!paymentConfirmed ? (
                      <div className="space-y-3">
                        {renderRequirementList(
                          buyRequirements,
                          'Exact payment reviewed. You can continue after sending it.',
                          'buy-requirements',
                        )}
                        <SketchyButton
                          aria-describedby="buy-requirements"
                          className="w-full py-3 text-lg uppercase tracking-tighter"
                          disabled={!hasValidAmount || !rateConfigured || loading}
                          onClick={() => setPaymentConfirmed(true)}
                          type="button"
                        >
                          I sent this payment
                        </SketchyButton>
                      </div>
                    ) : (
                      <div className="rough-border border-success-border bg-success-bg p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-success-text">
                          Step 2: Share proof
                        </p>
                        <p className="mt-2 text-sm font-mono text-success-text/80">
                          Enter your M-Pesa transaction code and upload the screenshot for that payment.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">
                      Expected Fiat Payout
                    </p>
                    <p className="text-3xl font-bold italic">
                      {hasValidAmount && rateConfigured ? `${formatMoney(fiatTotal)} ${fiatCurrency}` : `0.00 ${fiatCurrency}`}
                    </p>
                    <p className="text-sm font-mono opacity-70">
                      Rate: {rateConfigured ? `${formatMoney(activeRate)} ${fiatCurrency}/USDT` : 'P2P rate not configured'}
                    </p>
                    <p className="text-sm font-mono opacity-70">
                      Available to sell: {formatMoney(availableBalance)} USDT
                    </p>

                    {!paymentConfirmed ? (
                      <div className="space-y-4 pt-4 border-t-2 border-black/10">
                        <div className="rough-border border-info-border bg-info-bg p-4 mb-4">
                          <p className="text-xs font-bold uppercase tracking-[0.25em] text-info-text">
                            Where should we send KES?
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest" htmlFor="sell-mpesa-number">
                            M-Pesa Phone Number
                          </label>
                          <input
                            className="w-full text-lg font-mono bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                            id="sell-mpesa-number"
                            onChange={(e) => setMpesaNumber(e.target.value)}
                            placeholder="07XXXXXXXXX or 254XXXXXXXXX"
                            type="text"
                            value={mpesaNumber}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest" htmlFor="sell-mpesa-name">
                            Registered M-Pesa Name
                          </label>
                          <input
                            className="w-full text-lg font-mono bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors uppercase"
                            id="sell-mpesa-name"
                            onChange={(e) => setMpesaName(e.target.value)}
                            placeholder="JOHN DOE"
                            type="text"
                            value={mpesaName}
                          />
                        </div>

                        <SketchyButton
                          aria-describedby="sell-submit-requirements"
                          className="w-full py-3 text-lg uppercase tracking-tighter mt-4"
                          disabled={!hasValidAmount || !rateConfigured || !sellAmountWithinAvailable || !mpesaNumber.trim() || !mpesaName.trim()}
                          onClick={() => setPaymentConfirmed(true)}
                          type="button"
                        >
                          Review & Confirm
                        </SketchyButton>
                        {renderRequirementList(
                          sellRequirements,
                          'Payout details are ready to review.',
                          'sell-submit-requirements',
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rough-border border-success-border bg-success-bg p-4 space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.25em] text-success-text border-b border-success-border/30 pb-2 mb-2">
                            Order Summary
                          </p>
                          <p className="text-sm font-mono text-success-text/80">
                            <strong>Selling:</strong> {amount} USDT
                          </p>
                          <p className="text-sm font-mono text-success-text/80">
                            <strong>Receiving:</strong> {hasValidAmount && rateConfigured ? `${formatMoney(fiatTotal)} ${fiatCurrency}` : `0.00 ${fiatCurrency}`}
                          </p>
                          <p className="text-sm font-mono text-success-text/80 pt-2">
                            <strong>To M-Pesa:</strong> {mpesaNumber}
                          </p>
                          <p className="text-sm font-mono text-success-text/80 uppercase">
                            <strong>Name:</strong> {mpesaName}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <SketchyButton onClick={() => setPaymentConfirmed(false)} type="button" variant="secondary">
                            Edit details
                          </SketchyButton>
                          <SketchyButton onClick={resetTradeForm} type="button" variant="secondary">
                            Cancel
                          </SketchyButton>
                        </div>
                        {renderRequirementList(
                          sellRequirements,
                          'Review complete. Submit when the amount and payout details look right.',
                          'sell-submit-requirements',
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {activeTab === 'buy' && paymentConfirmed ? (
                <div className="space-y-4">
                  <div>
                    <label
                      className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                      htmlFor={MERCHANT_TRANSACTION_CODE_ID}
                    >
                      M-Pesa Transaction Code
                    </label>
                    <input
                      aria-describedby="buy-submit-requirements"
                      className="w-full text-lg font-mono bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors uppercase"
                      id={MERCHANT_TRANSACTION_CODE_ID}
                      inputMode="text"
                      maxLength={13}
                      onChange={(event) => setTransactionCode(event.target.value)}
                      placeholder="10-character code"
                      required
                      type="text"
                      value={transactionCode}
                    />
                  </div>
                  {renderProofUpload()}
                  {renderRequirementList(
                    buyRequirements,
                    'Proof and transaction code are ready. Review once more before submitting.',
                    'buy-submit-requirements',
                  )}
                </div>
              ) : null}

              <SketchyButton
                aria-describedby={activeTab === 'buy' && !paymentConfirmed ? 'buy-requirements' : activeTab === 'buy' ? 'buy-submit-requirements' : 'sell-submit-requirements'}
                className="w-full py-4 text-2xl uppercase tracking-tighter"
                disabled={loading || (activeTab === 'buy' ? !buyReadyForSubmit : !sellReadyForSubmit)}
                type="submit"
              >
                {loading
                  ? 'Processing…'
                  : activeTab === 'buy'
                    ? 'Submit Buy Order'
                    : 'Place Sell Order'}
              </SketchyButton>
            </form>
          </div>

          <details className="sticky-note order-2 rough-border p-4 sm:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold uppercase tracking-tighter underline">
              <StickyNote className="text-warning-text" size={20} />
              View M-Pesa details
            </summary>
            <div className="mt-4">
              {renderMpesaInstructionContent()}
            </div>
          </details>

          <div className="order-2 hidden sm:block lg:order-1">
            <div className="sticky-note p-6 rough-border flex-1 relative">
              <div className="absolute -top-3 left-1/2 -ml-8">
                <div className="tape w-16 h-6 rotate-2"></div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <StickyNote className="text-warning-text" />
                <h2 className="text-2xl font-semibold uppercase tracking-tighter underline">
                  M-Pesa P2P Instructions
                </h2>
              </div>
              {renderMpesaInstructionContent()}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rough-border bg-white p-8 relative h-full flex flex-col min-h-[600px] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <History className="text-ink-blue" />
                <h2 className="text-3xl font-semibold italic tracking-tighter uppercase underline decoration-double">
                  Recent Trades
                </h2>
              </div>
              <div className="text-[10px] uppercase font-bold opacity-30 font-mono tracking-widest">
                P2P history
              </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              {orders.length === 0 ? (
                <EmptyState className="my-8">No P2P trades yet. Your buy and sell orders will appear here.</EmptyState>
              ) : (
                orders.map((order) => (
                  <div key={order._id} className="group relative">
                    <div className="relative z-10 flex flex-col gap-3 border-b-2 border-black/5 bg-white p-4 transition-colors hover:bg-black/5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className={cn(
                            'rough-border flex size-10 items-center justify-center font-bold',
                            order.type === 'BUY' ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text',
                          )}
                        >
                          {order.type === 'BUY' ? '↓' : '↑'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xl tracking-tight">
                            {getP2pTradeSummary(order)} {formatMoney(order.amount)} USDT
                          </p>
                          <p className="text-[10px] opacity-40 font-mono font-bold uppercase">
                            {formatP2pOrderReference(order._id)} | {formatDateTime(order.createdAt)}
                          </p>
                          {order.exchangeRate && order.fiatTotal && order.fiatCurrency ? (
                            <p className="mt-2 text-xs font-mono opacity-60">
                              {formatMoney(order.fiatTotal)} {order.fiatCurrency} at {formatMoney(order.exchangeRate)} {order.fiatCurrency}/USDT
                            </p>
                          ) : null}
                          {isAdmin && order.transactionCode ? (
                            <p className="mt-1 text-xs font-mono opacity-60">
                              M-Pesa code: <span className="font-bold text-ink-black">{order.transactionCode}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <StatusBadge tone={statusToneFromStatus(order.status)}>
                          {getP2pOrderStatusLabel(order.status)}
                        </StatusBadge>

                        {isAdmin && order.status === 'PENDING' && (
                          <div className="flex gap-2 mt-3 justify-end">
                            <SketchyButton
                              className="text-[11px] font-bold text-success-text hover:scale-110 transition-transform px-2"
                              fill="var(--color-success-bg)"
                              stroke="var(--color-success-border)"
                              onClick={() => void handleStatusUpdate(order._id, 'DONE')}
                              type="button"
                            >
                              DONE
                            </SketchyButton>
                            <SketchyButton
                              className="text-[11px] font-bold text-danger-text hover:scale-110 transition-transform px-2"
                              fill="var(--color-danger-bg)"
                              stroke="var(--color-danger-border)"
                              onClick={() => void handleStatusUpdate(order._id, 'REJECTED')}
                              type="button"
                            >
                              FAIL
                            </SketchyButton>
                            {order.proof?.url ? (
                              <a
                                href={order.proof.url}
                                rel="noopener noreferrer"
                                target="_blank"
                                className="bg-info-bg px-2 text-[11px] font-bold text-info-text transition-transform hover:scale-110"
                              >
                                PROOF
                              </a>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {isAdmin && (
              <div className="mt-8 flex items-center gap-3 border-2 border-warning-border bg-warning-bg p-4 text-sm italic text-warning-text">
                <span aria-hidden="true" className="text-2xl">⚠️</span>
                <span className="font-bold">
                  Please verify the M-Pesa screenshot matches the transaction details before approving.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MerchantPanel;
