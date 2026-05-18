import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDown, History, StickyNote, Upload } from 'lucide-react';
import { ApiClientError } from '../../services/api/apiClient';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import {
  createOrder,
  getMerchantConfig,
  getOrders,
  updateOrderStatus,
} from '../../services/orders.service';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import { formatMoneyValue, moneyToNumber } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';
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

const MerchantPanel = () => {
  const { isAdmin, refreshUser } = useAuth();
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

  useEffect(() => {
    const controller = new AbortController();

    const loadMerchantView = async () => {
      try {
        const [ordersData, configData] = await Promise.all([
          getOrders(controller.signal),
          getMerchantConfig(controller.signal),
        ]);

        setOrders(ordersData);
        setMerchantConfig(configData);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        showError('Failed to load merchant settings.');
      }
    };

    void loadMerchantView();

    return () => {
      controller.abort();
    };
  }, [showError]);

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

  const amountValue = Number(amount);
  const hasValidAmount = Number.isFinite(amountValue) && amountValue > 0;
  const activeRate = activeTab === 'buy'
    ? merchantConfig?.buyRateKesPerUsdt ?? 0
    : merchantConfig?.sellRateKesPerUsdt ?? 0;
  const activeRateValue = moneyToNumber(activeRate);
  const rateConfigured = activeRateValue > 0;
  const fiatTotal = hasValidAmount && rateConfigured
    ? roundMoney(amountValue * activeRateValue)
    : null;
  const fiatCurrency = merchantConfig?.fiatCurrency ?? 'KES';
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
    && mpesaNumber.trim().length > 0
    && mpesaName.trim().length > 0
    && paymentConfirmed
  );

  const buyInstructionTitle = useMemo(() => {
    if (!hasValidAmount || !rateConfigured) {
      return `Enter the amount of USDT you want to buy.`;
    }

    return `Pay ${formatMoney(fiatTotal)} ${fiatCurrency} to buy ${formatMoney(amountValue)} USDT.`;
  }, [amountValue, fiatCurrency, fiatTotal, hasValidAmount, rateConfigured]);

  const handleOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasValidAmount) {
      showError('Enter a valid USDT amount.');
      return;
    }

    if (!rateConfigured) {
      showError('Merchant exchange rate is not configured yet.');
      return;
    }

    setLoading(true);

    try {
      const parsedAmount = amountValue.toFixed(6);

      if (activeTab === 'buy') {
        if (!paymentConfirmed) {
          throw new Error('Confirm payment after paying before you submit the order.');
        }

        if (!transactionCode.trim()) {
          throw new Error('Enter your M-Pesa transaction code.');
        }

        if (!proofImage) {
          throw new Error('Upload your payment screenshot before submitting.');
        }

        const order = await createOrder({
          type: 'BUY',
          amount: parsedAmount,
          transactionCode: transactionCode.trim(),
          proofImage,
        });

        setOrders((currentOrders) => [order, ...currentOrders]);
        success('Buy order submitted.');
      } else {
        if (!paymentConfirmed) {
          throw new Error('Please review and confirm your details before submitting.');
        }
        if (!mpesaNumber.trim() || !mpesaName.trim()) {
          throw new Error('Please provide your M-Pesa details.');
        }
        if (!/^(07\d{8}|254\d{9})$/.test(mpesaNumber.trim())) {
          throw new Error('Please enter a valid M-Pesa number (07XXXXXXXXX or 254XXXXXXXXX).');
        }

        const order = await createOrder({
          type: 'SELL',
          amount: parsedAmount,
          mpesaNumber: mpesaNumber.trim(),
          mpesaName: mpesaName.trim(),
        });

        setOrders((currentOrders) => [order, ...currentOrders]);
        success('Sell order placed.');
      }

      resetTradeForm();
      await refreshUser();
    } catch (error) {
      showError(getApiErrorMessage(error, 'Transaction failed. Please try again.'));
    } finally {
      setLoading(false);
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

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="sticky-note p-6 rough-border flex-1 relative">
              <div className="absolute -top-3 left-1/2 -ml-8">
                <div className="tape w-16 h-6 rotate-2"></div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <StickyNote className="text-yellow-700" />
                <h2 className="text-2xl font-bold uppercase tracking-tighter underline">
                  Fiat Merchant Instructions
                </h2>
              </div>
              <div className="space-y-4 font-mono text-sm leading-relaxed">
                <div className="p-3 bg-white/40 border-l-4 border-yellow-500">
                  <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">
                    M-Pesa Till / Merchant ID
                  </p>
                  <p className="font-bold text-xl tracking-tight italic">
                    {merchantConfig?.mpesaNumber ?? 'Loading...'}
                  </p>
                </div>
                <div className="p-3 bg-white/40 border-l-4 border-yellow-500">
                  <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">TON Wallet Address</p>
                  <p className="font-bold break-all text-xs">
                    {merchantConfig?.walletAddress ?? 'Loading...'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white/40 border-l-4 border-success-border">
                    <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">Buy Rate</p>
                    <p className="font-bold text-lg tracking-tight">
                      {merchantConfig ? `${formatMoney(merchantConfig.buyRateKesPerUsdt)} ${fiatCurrency}` : 'Loading...'}
                    </p>
                    <p className="text-[10px] opacity-50 mt-1">per 1 USDT</p>
                  </div>
                  <div className="p-3 bg-white/40 border-l-4 border-danger-border">
                    <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">Sell Rate</p>
                    <p className="font-bold text-lg tracking-tight">
                      {merchantConfig ? `${formatMoney(merchantConfig.sellRateKesPerUsdt)} ${fiatCurrency}` : 'Loading...'}
                    </p>
                    <p className="text-[10px] opacity-50 mt-1">per 1 USDT</p>
                  </div>
                </div>
                <p className="italic text-xs opacity-70 font-bold bg-white/20 p-2 whitespace-pre-wrap">
                  {merchantConfig?.instructions ?? 'Loading merchant instructions...'}
                </p>
              </div>
            </div>

            <div className="flex-1">
              <div className="relative min-h-[240px]">
                {activeTab === 'buy' && paymentConfirmed ? (
                  <div className="absolute -top-12 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center text-success-text animate-bounce">
                    <span className="border-2 border-success-border bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-center whitespace-nowrap">
                      Upload your payment screenshot here
                    </span>
                    <ArrowDown className="mt-1" size={28} />
                  </div>
                ) : null}

                <label
                  className={cn(
                    'rough-border border-dashed border-black/30 flex min-h-[240px] w-full flex-col items-center justify-center text-center p-6 transition-colors',
                    activeTab === 'buy' && paymentConfirmed
                      ? 'bg-white hover:bg-yellow-50 cursor-pointer shadow-lg'
                      : 'bg-black/5 opacity-70',
                  )}
                  htmlFor={MERCHANT_PROOF_ID}
                >
                  <Upload className="opacity-30 mb-3" size={48} />
                  <p className="text-sm italic opacity-70 font-bold uppercase tracking-widest">
                    Drop payment screenshot here
                  </p>
                  <p className="mt-3 text-xs font-mono opacity-60 max-w-xs">
                    {activeTab === 'buy'
                      ? paymentConfirmed
                        ? 'This box is for your own M-Pesa payment proof upload.'
                        : 'Pay first, then confirm payment to unlock proof upload.'
                      : 'Screenshot upload is only required for Buy USDT orders.'}
                  </p>
                  <p className="mt-4 text-sm font-bold text-ink-blue">
                    {proofImage ? `Selected: ${proofImage.name}` : activeTab === 'buy' && paymentConfirmed ? 'PNG, JPG, or WEBP only.' : 'Waiting for payment confirmation.'}
                  </p>
                </label>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={activeTab !== 'buy' || !paymentConfirmed}
                  id={MERCHANT_PROOF_ID}
                  key={`${activeTab}-${paymentConfirmed}-${proofImage?.name ?? 'empty'}`}
                  onChange={(event) => setProofImage(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </div>
            </div>
          </div>

          <div className="bg-white/80 p-4 shadow-xl">
            <div className="flex gap-4 mb-8" role="tablist" aria-label="Merchant trade types">
              <SketchyButton
                aria-controls="merchant-buy-panel"
                aria-selected={activeTab === 'buy'}
                className={cn(
                  'flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter',
                  activeTab === 'buy' ? 'border-ink-black bg-black/5 scale-105' : 'border-transparent opacity-30',
                )}
                fill={activeTab === 'buy' ? '#f3f4f6' : 'transparent'}
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
                fill={activeTab === 'sell' ? '#f3f4f6' : 'transparent'}
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
                        Step 1: Pay First
                      </p>
                      <p className="mt-2 text-2xl font-bold italic">{buyInstructionTitle}</p>
                      <p className="mt-2 text-sm font-mono opacity-70">
                        Active rate: {rateConfigured ? `${formatMoney(activeRate)} ${fiatCurrency}/USDT` : 'Merchant rate not configured'}
                      </p>
                    </div>

                    {hasValidAmount && rateConfigured ? (
                      <div className="rough-border border-warning-border bg-warning-bg px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-warning-text">
                          Payment summary
                        </p>
                        <p className="mt-3 text-3xl font-bold italic text-warning-text">
                          {formatMoney(fiatTotal)} {fiatCurrency}
                        </p>
                        <p className="mt-2 text-sm font-mono text-warning-text/80">
                          Send this exact amount to {merchantConfig?.mpesaNumber ?? 'the merchant'} before you confirm payment.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-mono opacity-60">
                        Enter a valid amount to see the exact {fiatCurrency} total you need to pay.
                      </p>
                    )}

                    {!paymentConfirmed ? (
                      <SketchyButton
                        className="w-full py-3 text-lg uppercase tracking-tighter"
                        disabled={!hasValidAmount || !rateConfigured || loading}
                        onClick={() => setPaymentConfirmed(true)}
                        type="button"
                      >
                        Confirm Payment
                      </SketchyButton>
                    ) : (
                      <div className="rough-border border-success-border bg-success-bg px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-success-text">
                          Step 2: Share proof
                        </p>
                        <p className="mt-2 text-sm font-mono text-success-text/80">
                          Paste your M-Pesa transaction code and upload your screenshot using the proof box.
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
                      Rate: {rateConfigured ? `${formatMoney(activeRate)} ${fiatCurrency}/USDT` : 'Merchant rate not configured'}
                    </p>

                    {!paymentConfirmed ? (
                      <div className="space-y-4 pt-4 border-t-2 border-black/10">
                        <div className="rough-border border-info-border bg-info-bg px-4 py-4 mb-4">
                          <p className="text-xs font-bold uppercase tracking-[0.25em] text-info-text">
                            Where should the merchant send KES?
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
                          className="w-full py-3 text-lg uppercase tracking-tighter mt-4"
                          disabled={!hasValidAmount || !rateConfigured || !mpesaNumber.trim() || !mpesaName.trim()}
                          onClick={() => setPaymentConfirmed(true)}
                          type="button"
                        >
                          Review & Confirm
                        </SketchyButton>
                      </div>
                    ) : (
                      <div className="rough-border border-success-border bg-success-bg px-4 py-4 space-y-2">
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
                    )}
                  </div>
                )}
              </div>

              {activeTab === 'buy' && paymentConfirmed ? (
                <div>
                  <label
                    className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                    htmlFor={MERCHANT_TRANSACTION_CODE_ID}
                  >
                    M-Pesa Transaction Code
                  </label>
                  <input
                    className="w-full text-lg font-mono bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors uppercase"
                    id={MERCHANT_TRANSACTION_CODE_ID}
                    onChange={(event) => setTransactionCode(event.target.value)}
                    placeholder="QWE123ABC"
                    required
                    type="text"
                    value={transactionCode}
                  />
                </div>
              ) : null}

              <SketchyButton className="w-full py-4 text-2xl uppercase tracking-tighter" disabled={loading || (activeTab === 'buy' ? !buyReadyForSubmit : !sellReadyForSubmit)} type="submit">
                {loading
                  ? 'Processing...'
                  : activeTab === 'buy'
                    ? 'Submit Buy Order'
                    : 'Place Sell Order'}
              </SketchyButton>
            </form>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rough-border bg-white p-8 relative h-full flex flex-col min-h-[600px] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <History className="text-ink-blue" />
                <h2 className="text-3xl font-bold italic tracking-tighter uppercase underline decoration-double">
                  The Ledger
                </h2>
              </div>
              <div className="text-[10px] uppercase font-bold opacity-30 font-mono tracking-widest">
                Authenticated Nodes ONLY
              </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              {orders.length === 0 ? (
                <EmptyState className="my-8">History is clean of ink.</EmptyState>
              ) : (
                orders.map((order) => (
                  <div key={order._id} className="group relative">
                    <div className="flex items-center justify-between p-4 bg-white hover:bg-black/5 transition-colors border-b-2 border-black/5 relative z-10">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'rough-border flex h-10 w-10 items-center justify-center font-bold',
                            order.type === 'BUY' ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text',
                          )}
                        >
                          {order.type === 'BUY' ? '↓' : '↑'}
                        </div>
                        <div>
                          <p className="font-bold text-xl tracking-tight">
                            {order.type === 'BUY' ? 'BUY USDT' : 'SELL USDT'} {formatMoney(order.amount)} USDT
                          </p>
                          <p className="text-[10px] opacity-40 font-mono font-bold uppercase">
                            TX-{order._id.substring(0, 12)} | {new Date(order.createdAt).toLocaleDateString()}
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
                          {order.status}
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
                                className="text-[11px] font-bold text-blue-700 hover:scale-110 transition-transform bg-blue-100 px-2"
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
              <div className="mt-8 p-4 bg-orange-100 border-2 border-orange-300 italic text-sm text-orange-900 flex items-center gap-3">
                <span aria-hidden="true" className="text-2xl">⚠️</span>
                <span className="font-bold">
                  ENSURE TO SUBMIT MPESA SCREENSHOT
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
