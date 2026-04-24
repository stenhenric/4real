import { useEffect, useState, type FormEvent } from 'react';
import { History, StickyNote, Upload } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import {
  createOrder,
  getMerchantConfig,
  getOrders,
  updateOrderStatus,
} from '../../services/orders.service';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import type { MerchantConfigDTO, OrderDTO } from '../../types/api';

type MerchantTab = 'buy' | 'sell';

const MERCHANT_AMOUNT_ID = 'merchant-amount';
const MERCHANT_PROOF_ID = 'merchant-proof';

const MerchantPanel = () => {
  const { isAdmin, refreshUser } = useAuth();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<MerchantTab>('buy');
  const [amount, setAmount] = useState('');
  const [proofUrl, setProofUrl] = useState('');
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

  const handleOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!amount || !proofUrl) {
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      showError('Invalid amount');
      return;
    }

    setLoading(true);

    try {
      const order = await createOrder({
        type: activeTab.toUpperCase() as 'BUY' | 'SELL',
        amount: parsedAmount,
        proofImageUrl: proofUrl,
      });

      setOrders((currentOrders) => [order, ...currentOrders]);
      setAmount('');
      setProofUrl('');
      success(`${activeTab.toUpperCase()} order submitted successfully.`);
      await refreshUser();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Transaction failed');
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
    } catch {
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
                  Merchant Instructions
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
                <p className="italic text-xs opacity-70 font-bold bg-white/20 p-2">
                  {merchantConfig?.instructions ?? 'Loading merchant instructions...'}
                </p>
              </div>
            </div>

            <div className="rough-border border-dashed border-black/30 bg-black/5 flex flex-col items-center justify-center text-center p-6 flex-1 min-h-[200px]">
              <Upload className="opacity-20 mb-2" size={48} />
              <p className="text-sm italic opacity-40 font-bold uppercase tracking-widest">
                Drop payment screenshot here...
              </p>
              <div className="mt-4 text-3xl animate-bounce">📸</div>
            </div>
          </div>

          <SketchyContainer className="bg-white/80 shadow-xl" roughness={0.5}>
            <div className="flex gap-4 mb-8" role="tablist" aria-label="Merchant trade types">
              <button
                aria-controls="merchant-buy-panel"
                aria-selected={activeTab === 'buy'}
                className={cn(
                  'flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter',
                  activeTab === 'buy' ? 'border-ink-black bg-black/5 scale-105' : 'border-transparent opacity-30',
                )}
                id="merchant-buy-tab"
                onClick={() => setActiveTab('buy')}
                role="tab"
                type="button"
              >
                Buy Credits
              </button>
              <button
                aria-controls="merchant-sell-panel"
                aria-selected={activeTab === 'sell'}
                className={cn(
                  'flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter',
                  activeTab === 'sell' ? 'border-ink-black bg-black/5 scale-105' : 'border-transparent opacity-30',
                )}
                id="merchant-sell-tab"
                onClick={() => setActiveTab('sell')}
                role="tab"
                type="button"
              >
                Withdraw USDT
              </button>
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
                  Wager / Purchase Amount (USDT)
                </label>
                <div className="relative">
                  <input
                    className="w-full text-5xl font-bold bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                    id={MERCHANT_AMOUNT_ID}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    required
                    type="number"
                    value={amount}
                  />
                  <span className="absolute right-2 bottom-4 text-2xl opacity-20 font-bold">USDT</span>
                </div>
              </div>

              <div>
                <label
                  className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest"
                  htmlFor={MERCHANT_PROOF_ID}
                >
                  Transaction Proof (IMGUR/LINK)
                </label>
                <input
                  className="w-full text-lg font-bold bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                  id={MERCHANT_PROOF_ID}
                  onChange={(event) => setProofUrl(event.target.value)}
                  placeholder="https://imgur.com/your-proof"
                  required
                  type="url"
                  value={proofUrl}
                />
              </div>

              <SketchyButton className="w-full py-4 text-2xl uppercase tracking-tighter" disabled={loading} type="submit">
                {loading ? 'Processing...' : `Execute ${activeTab.toUpperCase()} Trade`}
              </SketchyButton>
            </form>
          </SketchyContainer>
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
                <div className="py-24 text-center opacity-20 italic font-bold text-lg uppercase tracking-widest">
                  History is clean of ink.
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order._id} className="group relative">
                    <div className="flex items-center justify-between p-4 bg-white hover:bg-black/5 transition-colors border-b-2 border-black/5 relative z-10">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center font-bold text-white',
                            order.type === 'BUY' ? 'bg-green-700' : 'bg-red-700',
                          )}
                        >
                          {order.type === 'BUY' ? '↓' : '↑'}
                        </div>
                        <div>
                          <p className="font-bold text-xl tracking-tight">
                            {order.type} {order.amount.toFixed(2)} USDT
                          </p>
                          <p className="text-[10px] opacity-40 font-mono font-bold uppercase">
                            TX-{order._id.substring(0, 12)} | {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-3 py-1 rounded-full border-2 uppercase',
                            order.status === 'PENDING'
                              ? 'border-yellow-600 text-yellow-600 bg-yellow-50'
                              : order.status === 'DONE'
                                ? 'border-green-600 text-green-600 bg-green-50'
                                : 'border-red-600 text-red-600 bg-red-50',
                          )}
                        >
                          {order.status}
                        </span>

                        {isAdmin && order.status === 'PENDING' && (
                          <div className="flex gap-2 mt-3 justify-end">
                            <button
                              className="text-[11px] font-bold text-green-700 hover:scale-110 transition-transform bg-green-100 px-2 rounded"
                              onClick={() => void handleStatusUpdate(order._id, 'DONE')}
                              type="button"
                            >
                              DONE
                            </button>
                            <button
                              className="text-[11px] font-bold text-red-700 hover:scale-110 transition-transform bg-red-100 px-2 rounded"
                              onClick={() => void handleStatusUpdate(order._id, 'REJECTED')}
                              type="button"
                            >
                              FAIL
                            </button>
                            <a
                              href={order.proofImageUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                              className="text-[11px] font-bold text-blue-700 hover:scale-110 transition-transform bg-blue-100 px-2 rounded"
                            >
                              IMG
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {isAdmin && (
              <div className="mt-8 p-4 bg-orange-100 border-2 border-orange-300 rounded italic text-sm text-orange-900 flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <span className="font-bold">
                  ADMIN NODE ACTIVE: ENSURE PROOFS ARE AUTHENTIC BEFORE STATE RELEASE.
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
