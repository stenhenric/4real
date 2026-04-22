import React, { useState, useEffect } from 'react';
import request from '../lib/api/apiClient';
import { useAuth } from '../lib/AuthContext';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { Landmark, Upload, History, StickyNote } from 'lucide-react';
import { cn } from '../lib/utils';

const MerchantView: React.FC = () => {
  const { userData, isAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await request('/orders');
        setOrders(data);
      } catch (error) {
        console.error('Failed to fetch orders:', error);
      }
    };

    fetchOrders();
  }, []);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !proofUrl) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Invalid amount");
      return;
    }

    if (activeTab === 'sell' && parsedAmount > (userData?.balance || 0)) {
      alert("Insufficient balance to withdraw.");
      return;
    }

    setLoading(true);
    try {
      const order = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: activeTab.toUpperCase(),
          amount: parsedAmount,
          proofImageUrl: proofUrl
        })
      });
      setOrders([order, ...orders]);
      setAmount('');
      setProofUrl('');
      alert(`${activeTab.toUpperCase()} Order submitted successfully.`);
      await refreshUser();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updatedOrder = await request(`/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      setOrders(orders.map(o => o._id === orderId ? updatedOrder : o));
      await refreshUser();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col lg:row gap-8 lg:grid lg:grid-cols-12">
        {/* Merchant Box & Form */}
        <div className="lg:col-span-7 space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="sticky-note p-6 rough-border flex-1 relative">
              <div className="absolute -top-3 left-1/2 -ml-8">
                <div className="tape w-16 h-6 rotate-2"></div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <StickyNote className="text-yellow-700" />
                <h2 className="text-2xl font-bold uppercase tracking-tighter underline">Merchant Instructions</h2>
              </div>
              <div className="space-y-4 font-mono text-sm leading-relaxed">
                <div className="p-3 bg-white/40 border-l-4 border-yellow-500">
                  <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">M-Pesa Till / Merchant ID</p>
                  <p className="font-bold text-xl tracking-tight italic">900 800 700</p>
                </div>
                <div className="p-3 bg-white/40 border-l-4 border-yellow-500">
                  <p className="opacity-60 uppercase text-[10px] mb-1 font-bold">TON Wallet Address</p>
                  <p className="font-bold break-all text-xs">UQAz...8jX2 (Merchant Wallet)</p>
                </div>
                <p className="italic text-xs opacity-70 font-bold bg-white/20 p-2">
                  * Send exact amount and upload screenshot below.
                  Merchant release takes 5-30 mins.
                </p>
              </div>
            </div>

            <div className="rough-border border-dashed border-black/30 bg-black/5 flex flex-col items-center justify-center text-center p-6 flex-1 min-h-[200px]">
              <Upload className="opacity-20 mb-2" size={48} />
              <p className="text-sm italic opacity-40 font-bold uppercase tracking-widest">Drop payment screenshot here...</p>
              <div className="mt-4 text-3xl animate-bounce">📸</div>
            </div>
          </div>

          <SketchyContainer className="bg-white/80 shadow-xl" roughness={0.5}>
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setActiveTab('buy')}
                className={cn(
                  "flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter",
                  activeTab === 'buy' ? "border-ink-black bg-black/5 scale-105" : "border-transparent opacity-30"
                )}
              >
                Buy Credits
              </button>
              <button
                onClick={() => setActiveTab('sell')}
                className={cn(
                  "flex-1 py-3 text-xl font-bold border-b-4 transition-all uppercase tracking-tighter",
                  activeTab === 'sell' ? "border-ink-black bg-black/5 scale-105" : "border-transparent opacity-30"
                )}
              >
                Withdraw USDT
              </button>
            </div>

            <form onSubmit={handleOrder} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Wager / Purchase Amount (USDT)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-5xl font-bold bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                    placeholder="0.00"
                    required
                  />
                  <span className="absolute right-2 bottom-4 text-2xl opacity-20 font-bold">USDT</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Transaction Proof (IMGUR/LINK)</label>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  className="w-full text-lg font-bold bg-transparent border-b-2 border-black/10 focus:border-black p-2 transition-colors"
                  placeholder="https://imgur.com/your-proof"
                  required
                />
              </div>

              <SketchyButton type="submit" className="w-full py-4 text-2xl uppercase tracking-tighter" disabled={loading}>
                {loading ? 'Processing...' : `Execute ${activeTab.toUpperCase()} Trade`}
              </SketchyButton>
            </form>
          </SketchyContainer>
        </div>

        {/* Ledger */}
        <div className="lg:col-span-5">
          <div className="rough-border bg-white p-8 relative h-full flex flex-col min-h-[600px] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <History className="text-ink-blue" />
                <h2 className="text-3xl font-bold italic tracking-tighter uppercase underline decoration-double">The Ledger</h2>
              </div>
              <div className="text-[10px] uppercase font-bold opacity-30 font-mono tracking-widest">Authenticated Nodes ONLY</div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2">
              {orders.length === 0 ? (
                <div className="py-24 text-center opacity-20 italic font-bold text-lg uppercase tracking-widest">
                  History is clean of ink.
                </div>
              ) : (
                orders.map(order => (
                  <div key={order._id} className="group relative">
                    <div className="flex items-center justify-between p-4 bg-white hover:bg-black/5 transition-colors border-b-2 border-black/5 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold text-white",
                          order.type === 'BUY' ? "bg-green-700" : "bg-red-700"
                        )}>
                          {order.type === 'BUY' ? '↓' : '↑'}
                        </div>
                        <div>
                          <p className="font-bold text-xl tracking-tight">{order.type} {order.amount.toFixed(2)} USDT</p>
                          <p className="text-[10px] opacity-40 font-mono font-bold uppercase">
                            TX-{order._id.substring(0,12)} | {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-[10px] font-bold px-3 py-1 rounded-full border-2 uppercase",
                          order.status === 'PENDING' ? "border-yellow-600 text-yellow-600 bg-yellow-50" :
                          order.status === 'DONE' ? "border-green-600 text-green-600 bg-green-50" : "border-red-600 text-red-600 bg-red-50"
                        )}>
                          {order.status}
                        </span>

                        {isAdmin && order.status === 'PENDING' && (
                          <div className="flex gap-2 mt-3 justify-end">
                            <button
                              onClick={() => updateOrderStatus(order._id, 'DONE')}
                              className="text-[11px] font-bold text-green-700 hover:scale-110 transition-transform bg-green-100 px-2 rounded"
                            >
                              DONE
                            </button>
                            <button
                              onClick={() => updateOrderStatus(order._id, 'REJECTED')}
                              className="text-[11px] font-bold text-red-700 hover:scale-110 transition-transform bg-red-100 px-2 rounded"
                            >
                              FAIL
                            </button>
                            <a
                              href={order.proofImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
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
                <span className="font-bold">ADMIN NODE ACTIVE: ENSURE PROOFS ARE AUTHENTIC BEFORE STATE RELEASE.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MerchantView;
