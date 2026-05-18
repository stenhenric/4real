import { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, History, Landmark, Store } from 'lucide-react';
import { RouteLoading } from '../app/RouteLoading';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../components/ui/StatusBadge';
import { formatDateTime } from '../features/merchant/format';
import { getTransactionAccentClass, isCreditTransaction } from '../features/bank/transactionPresentation';
import { getTransactions } from '../services/transactions.service';
import { isAbortError } from '../utils/isAbortError';
import { formatMoneyValue, moneyToNumber } from '../utils/exact-money.ts';
import type { TransactionDTO } from '../types/api';

const TRANSACTION_LABELS: Record<string, string> = {
  DEPOSIT_CONFIRMED: 'Deposit',
  DEPOSIT_PENDING: 'Deposit Pending',
  WITHDRAWAL_QUEUED: 'Withdrawal',
  WITHDRAWAL_COMPLETED: 'Withdrawal Completed',
  WITHDRAWAL_FAILED: 'Withdrawal Failed',
  MATCH_WINNINGS: 'Match Winnings',
  MATCH_ENTRY_FEE: 'Match Entry',
  MATCH_REFUND: 'Match Refund',
  MATCH_COMMISSION_CREDIT: 'Platform Fee',
  ORDER_BUY_CREDIT: 'Buy (Fiat)',
  ORDER_SELL_DEBIT: 'Sell (Fiat)',
};

function formatTransactionType(type: string): string {
  return TRANSACTION_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

type BankView = 'portal' | 'merchant' | 'deposit' | 'withdraw';

const DepositPanel = lazy(() => import('../features/bank/DepositPanel'));
const MerchantPanel = lazy(() => import('../features/bank/MerchantPanel'));
const WithdrawPanel = lazy(() => import('../features/bank/WithdrawPanel'));

const BankPage = () => {
  const [activeView, setActiveView] = useState<BankView>('portal');
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const { error: showError } = useToast();

  useEffect(() => {
    if (activeView !== 'portal') {
      return undefined;
    }

    const controller = new AbortController();

    const fetchTransactions = async () => {
      try {
        const data = await getTransactions({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setTransactions(data.items);
          setTransactionsError(null);
        }
      } catch (error) {
        if (isAbortError(error, controller.signal)) {
          return;
        }

        setTransactionsError('Failed to fetch transactions.');
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
        <SketchyButton
          className="text-sm font-bold uppercase underline hover:opacity-70 transition-opacity mb-4 inline-block"
          onClick={() => setActiveView('portal')}
          type="button"
        >
          {'←'} Back to Bank Portal
        </SketchyButton>
        <Suspense fallback={<RouteLoading message="Loading bank portal…" />}>
          <ActivePanel />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-semibold italic tracking-tighter flex justify-center items-center gap-4 mb-4">
          <Landmark size={48} className="text-ink-blue" />
          The Bank
        </h1>
        <p className="text-lg opacity-60 font-mono font-bold uppercase tracking-widest">
          Manage your assets and trace the ink
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <SketchyContainer roughness={1} className="bg-white/85 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl">
          <div className="rough-border mb-4 flex size-20 items-center justify-center bg-success-bg">
            <ArrowDownRight size={40} className="text-success-text" />
          </div>
          <h2 className="text-2xl font-semibold uppercase tracking-tighter mb-2">Deposit</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">Automated USDT on TON</p>
          <SketchyButton className="w-full" onClick={() => setActiveView('deposit')}>
            Deposit USDT
          </SketchyButton>
        </SketchyContainer>

        <SketchyContainer roughness={1} className="bg-white/85 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl">
          <div className="rough-border mb-4 flex size-20 items-center justify-center bg-danger-bg">
            <ArrowUpRight size={40} className="text-danger-text" />
          </div>
          <h2 className="text-2xl font-semibold uppercase tracking-tighter mb-2">Withdraw</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">USDT to a TON wallet</p>
          <SketchyButton className="w-full" onClick={() => setActiveView('withdraw')}>
            Withdraw USDT
          </SketchyButton>
        </SketchyContainer>

        <SketchyContainer roughness={1} className="bg-white/90 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-2xl relative">
          <div className="absolute -top-3 -right-3 rotate-12 bg-note-yellow text-black text-[10px] font-bold uppercase px-3 py-1 shadow-md border-2 border-black">
            P2P Active
          </div>
          <div className="rough-border mb-4 flex size-20 items-center justify-center bg-note-yellow">
            <Store size={40} className="text-warning-text" />
          </div>
          <h2 className="text-2xl font-semibold uppercase tracking-tighter mb-2">Merchant</h2>
          <p className="text-xs font-mono font-bold opacity-60 mb-6">Fiat / M-Pesa P2P</p>
          <SketchyButton
            className="w-full text-warning-text"
            fill="var(--color-note-yellow)"
            onClick={() => setActiveView('merchant')}
          >
            Buy / Sell via Fiat
          </SketchyButton>
        </SketchyContainer>
      </div>

      <div className="mt-16 rough-border bg-white p-8 relative shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <History size={32} className="text-ink-black opacity-70" />
          <h2 className="text-3xl font-semibold italic tracking-tighter uppercase underline decoration-wavy">
            Global Transaction History
          </h2>
        </div>

        <div className="space-y-4">
          {transactionsError ? (
            <EmptyState>{transactionsError}</EmptyState>
          ) : transactions.length === 0 ? (
            <EmptyState>No ink has been spilled yet.</EmptyState>
          ) : (
            transactions.map((transaction) => (
              <div
                key={transaction._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b-2 border-black/5 hover:bg-black/5 transition-colors"
              >
                <div className="flex items-center gap-4 mb-2 sm:mb-0">
                  <div
                    className={`size-12 flex items-center justify-center font-bold text-white text-lg ${getTransactionAccentClass(transaction)}`}
                  >
                    {isCreditTransaction(transaction) ? '+' : ''}
                    {isCreditTransaction(transaction) ? '↑' : '↓'}
                  </div>
                  <div>
                    <p className="font-bold text-xl uppercase tracking-tight">
                      {formatTransactionType(transaction.type)}
                    </p>
                    <p className="text-xs font-mono opacity-50 font-bold">
                      {formatDateTime(transaction.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                  <span
                    className={`font-bold text-2xl tracking-tighter ${moneyToNumber(transaction.amount) > 0 ? 'text-green-700' : 'text-red-700'}`}
                  >
                    {moneyToNumber(transaction.amount) > 0 ? '+' : ''}
                    {formatMoneyValue(transaction.amount)}
                  </span>
                  <StatusBadge className="mt-1" tone={statusToneFromStatus(transaction.status)}>
                    {transaction.status}
                  </StatusBadge>
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
