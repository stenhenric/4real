import { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, History, Landmark, Store } from 'lucide-react';
import { RouteLoading } from '../app/RouteLoading';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { getTransactions } from '../services/transactions.service';
import { isAbortError } from '../utils/isAbortError';
import type { TransactionDTO } from '../types/api';

type BankView = 'portal' | 'merchant' | 'deposit' | 'withdraw';

const DepositPanel = lazy(() => import('../features/bank/DepositPanel'));
const MerchantPanel = lazy(() => import('../features/bank/MerchantPanel'));
const WithdrawPanel = lazy(() => import('../features/bank/WithdrawPanel'));

const BankPage = () => {
  const [activeView, setActiveView] = useState<BankView>('portal');
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const { error: showError } = useToast();

  useEffect(() => {
    if (activeView !== 'portal') {
      return undefined;
    }

    const controller = new AbortController();

    const fetchTransactions = async () => {
      try {
        const data = await getTransactions(controller.signal);
        setTransactions(data);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        showError('Failed to fetch transactions.');
      }
    };

    void fetchTransactions();

    return () => {
      controller.abort();
    };
  }, [activeView, showError]);

  if (activeView !== 'portal') {
    const ActivePanel =
      activeView === 'merchant'
        ? MerchantPanel
        : activeView === 'deposit'
          ? DepositPanel
          : WithdrawPanel;

    return (
      <div className="space-y-4">
        <button
          className="text-sm font-bold uppercase underline hover:opacity-70 transition-opacity mb-4 inline-block"
          onClick={() => setActiveView('portal')}
          type="button"
        >
          &larr; Back to Bank Portal
        </button>
        <Suspense fallback={<RouteLoading message="Loading bank portal..." />}>
          <ActivePanel />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
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
        <SketchyContainer roughness={1} className="bg-white/80 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <ArrowDownRight size={40} className="text-green-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Deposit</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">Automated USDT on TON</p>
          <SketchyButton className="w-full" onClick={() => setActiveView('deposit')}>
            Deposit USDT
          </SketchyButton>
        </SketchyContainer>

        <SketchyContainer roughness={1} className="bg-white/80 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <ArrowUpRight size={40} className="text-red-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Withdraw</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">USDT to a TON wallet</p>
          <SketchyButton className="w-full" onClick={() => setActiveView('withdraw')}>
            Withdraw USDT
          </SketchyButton>
        </SketchyContainer>

        <SketchyContainer roughness={1} className="bg-white/90 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-2xl border-4 border-yellow-500/30 relative">
          <div className="absolute -top-3 -right-3 rotate-12 bg-yellow-400 text-black text-[10px] font-bold uppercase px-3 py-1 shadow-md border-2 border-black">
            P2P Active
          </div>
          <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
            <Store size={40} className="text-yellow-700" />
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2">Merchant</h2>
          <p className="text-xs font-mono font-bold opacity-60 mb-6">Fiat / M-Pesa P2P</p>
          <SketchyButton
            className="w-full bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border-yellow-700"
            onClick={() => setActiveView('merchant')}
          >
            Buy / Sell via Fiat
          </SketchyButton>
        </SketchyContainer>
      </div>

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
            transactions.map((transaction) => (
              <div
                key={transaction._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b-2 border-black/5 hover:bg-black/5 transition-colors"
              >
                <div className="flex items-center gap-4 mb-2 sm:mb-0">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg
                    ${transaction.type.includes('WIN') || transaction.type.includes('DEPOSIT') || transaction.type === 'SELL_P2P' || transaction.type === 'MATCH_REFUND' ? 'bg-green-600' :
                      transaction.type.includes('LOSS') || transaction.type.includes('WITHDRAW') || transaction.type === 'BUY_P2P' || transaction.type === 'MATCH_WAGER' ? 'bg-red-600' : 'bg-gray-600'}`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount > 0 ? '↑' : '↓'}
                  </div>
                  <div>
                    <p className="font-bold text-xl uppercase tracking-tight">
                      {transaction.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs font-mono opacity-50 font-bold">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                  <span
                    className={`font-bold text-2xl tracking-tighter ${transaction.amount > 0 ? 'text-green-700' : 'text-red-700'}`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount.toFixed(2)}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-1
                    ${transaction.status === 'COMPLETED' || transaction.status === 'DONE' || transaction.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      transaction.status === 'PENDING' || transaction.status === 'queued' || transaction.status === 'processing' || transaction.status === 'sent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {transaction.status}
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

export default BankPage;
