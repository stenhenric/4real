import React, { useState, useEffect } from 'react';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { ArrowUpRight } from 'lucide-react';
import request from '../lib/api/apiClient';
import { useToast } from '../lib/ToastContext';
import { useAuth } from '../lib/AuthContext';
import { useTonWallet } from '@tonconnect/ui-react';

const WithdrawView: React.FC = () => {
  const { userData, refreshUser } = useAuth();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const wallet = useTonWallet();

  useEffect(() => {
    if (wallet?.account?.address) {
      setToAddress(wallet.account.address);
    }
  }, [wallet]);


  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }

    if (!toAddress) {
      addToast('Please enter a valid TON address', 'error');
      return;
    }

    if (userData && Number(amount) > userData.balance) {
      addToast('Insufficient balance', 'error');
      return;
    }

    setLoading(true);
    try {
      await request('/transactions/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amountUsdt: Number(amount), toAddress })
      });
      addToast('Withdrawal requested successfully!', 'success');
      setAmount('');
      setToAddress('');
      await refreshUser();
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Withdrawal failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <SketchyContainer roughness={1} className="bg-white/90 p-8 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ArrowUpRight size={32} className="text-red-700" />
          </div>
          <div>
            <h2 className="text-3xl font-bold italic tracking-tighter uppercase">Withdraw TON</h2>
            <p className="text-sm font-mono opacity-60">Send funds from your balance to a TON wallet</p>
          </div>
        </div>

        <div className="mb-8 p-4 bg-black/5 rounded border border-black/10 flex justify-between items-center">
          <span className="font-bold uppercase tracking-widest text-sm opacity-60">Available Balance:</span>
          <span className="text-2xl font-bold font-mono text-ink-blue">
            {userData?.balance?.toFixed(2) || '0.00'} USDT
          </span>
        </div>

        <form onSubmit={handleWithdraw} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Withdrawal Amount (USDT)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={userData?.balance || 0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full text-4xl font-bold bg-transparent border-b-2 border-black/20 focus:border-black p-2 transition-colors"
                placeholder="0.00"
                required
              />
              <span className="absolute right-2 bottom-3 text-xl opacity-30 font-bold">USDT</span>
            </div>
          </div>

          <div>

          <div className="flex justify-between items-end">
            <label className="block text-xs font-bold uppercase opacity-50 mb-1 ml-1 tracking-widest">Destination TON Address</label>
            {wallet && (
              <button
                type="button"
                onClick={() => setToAddress(wallet.account.address)}
                className="text-[10px] font-bold uppercase bg-ink-blue text-white px-2 py-1 rounded hover:bg-blue-600 mb-1"
              >
                Auto-fill connected wallet
              </button>
            )}
          </div>
          <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              className="w-full text-lg font-mono bg-transparent border-b-2 border-black/20 focus:border-black p-2 transition-colors"
              placeholder="EQ..."
              required
            />
          </div>

          <SketchyButton type="submit" disabled={loading} className="w-full text-xl py-4 mt-4">
            {loading ? 'Processing...' : 'Request Withdrawal'}
          </SketchyButton>
        </form>
      </SketchyContainer>
    </div>
  );
};

export default WithdrawView;
