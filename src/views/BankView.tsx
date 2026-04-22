import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { Landmark, ArrowUpRight, ArrowDownRight, Store, History } from 'lucide-react';
import MerchantView from './MerchantView';
import request from '../lib/api/apiClient';

const BankView: React.FC = () => {
  const { userData } = useAuth();
  const [activeView, setActiveView] = useState<'portal' | 'merchant'>('portal');
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (activeView === 'portal') {
      const fetchTransactions = async () => {
        try {
          const data = await request('/transactions');
          setTransactions(data);
        } catch (error) {
          console.error('Failed to fetch transactions:', error);
        }
      };
      fetchTransactions();
    }
  }, [activeView]);

  if (activeView === 'merchant') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveView('portal')}
          className="text-sm font-bold uppercase underline hover:opacity-70 transition-opacity mb-4 inline-block"
        >
          &larr; Back to Bank Portal
        </button>
        <MerchantView />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold italic tracking-tighter flex justify-center items-center gap-4 mb-4">
          <Landmark size={48} className="text-ink-blue" />
          The Bank
        </h1>
        <p className="text-lg opacity-60 font-mono font-bold uppercase tracking-widest">
          Manage your assets and trace the ink
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Deposit Card */}
        <SketchyContainer roughness={1} className="bg-white/80 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl cursor-not-allowed opacity-50">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <ArrowDownRight size={40} className="text-green-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Deposit</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">Automated TON Deposit</p>
          <SketchyButton disabled className="w-full">Coming Soon</SketchyButton>
        </SketchyContainer>

        {/* Withdraw Card */}
        <SketchyContainer roughness={1} className="bg-white/80 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl cursor-not-allowed opacity-50">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <ArrowUpRight size={40} className="text-red-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Withdraw</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">Automated TON Withdraw</p>
          <SketchyButton disabled className="w-full">Coming Soon</SketchyButton>
        </SketchyContainer>

        {/* Merchant Card */}
        <SketchyContainer roughness={1} className="bg-white/90 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-2xl border-4 border-yellow-500/30 relative">
          <div className="absolute -top-3 -right-3 rotate-12 bg-yellow-400 text-black text-[10px] font-bold uppercase px-3 py-1 shadow-md border-2 border-black">
            P2P Active
          </div>
          <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
            <Store size={40} className="text-yellow-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Merchant</h2>
          <p className="text-xs font-mono font-bold opacity-60 mb-6">P2P Agent Trading</p>
          <SketchyButton onClick={() => setActiveView('merchant')} className="w-full bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border-yellow-700">
            Open Merchant UI
          </SketchyButton>
        </SketchyContainer>
      </div>

      {/* Global Transaction History */}
      <div className="mt-16 rough-border bg-white p-8 relative shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <History size={32} className="text-ink-black opacity-70" />
          <h2 className="text-3xl font-bold italic tracking-tighter uppercase underline decoration-wavy">
            Global Transaction History
          </h2>
        </div>

        <div className="space-y-4">
          {transactions.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-black/10 rounded">
              <p className="italic opacity-30 font-bold uppercase tracking-widest">
                No ink has been spilled yet.
              </p>
            </div>
          ) : (
            transactions.map(tx => (
              <div key={tx._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b-2 border-black/5 hover:bg-black/5 transition-colors">
                <div className="flex items-center gap-4 mb-2 sm:mb-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg
                    ${tx.type.includes('WIN') || tx.type.includes('DEPOSIT') || tx.type === 'SELL_P2P' ? 'bg-green-600' :
                      tx.type.includes('LOSS') || tx.type.includes('WITHDRAW') || tx.type === 'BUY_P2P' || tx.type === 'MATCH_WAGER' ? 'bg-red-600' : 'bg-gray-600'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount > 0 ? '↑' : '↓'}
                  </div>
                  <div>
                    <p className="font-bold text-xl uppercase tracking-tight">{tx.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs font-mono opacity-50 font-bold">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                  <span className={`font-bold text-2xl tracking-tighter ${tx.amount > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-1
                    ${tx.status === 'COMPLETED' || tx.status === 'DONE' ? 'bg-green-100 text-green-700' :
                      tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default BankView;
