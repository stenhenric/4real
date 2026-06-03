import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, History, Landmark, Store } from 'lucide-react';
import { RouteLoading } from '../app/RouteLoading';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../components/ui/StatusBadge';
import { formatDateTime } from '../features/merchant/format';
import { getTransactionAccentClass, isCreditTransaction } from '../features/bank/transactionPresentation';
import {
  getBankViewFromSearchParams,
  updateBankViewSearch,
  type BankView,
} from '../features/bank/bankRouting';
import {
  BANK_TRANSACTION_PAGE_SIZE,
  getHasMoreTransactions,
  mergeTransactionPages,
} from '../features/bank/transactionPagination';
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

const DepositPanel = lazy(() => import('../features/bank/DepositPanel'));
const MerchantPanel = lazy(() => import('../features/bank/MerchantPanel'));
const TonConnectRouteProvider = lazy(() => import('../app/TonConnectRouteProvider').then((module) => ({
  default: module.TonConnectRouteProvider,
})));
const WithdrawPanel = lazy(() => import('../features/bank/WithdrawPanel'));

const BankPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = getBankViewFromSearchParams(searchParams);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [nextTransactionsLoading, setNextTransactionsLoading] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [nextTransactionsError, setNextTransactionsError] = useState<string | null>(null);
  const transactionRequestRef = useRef(0);
  const { error: showError } = useToast();

  const setBankView = useCallback((view: BankView) => {
    setSearchParams(updateBankViewSearch(searchParams, view));
  }, [searchParams, setSearchParams]);

  const fetchTransactionsPage = useCallback(async (
    page: number,
    options: { replace: boolean; signal?: AbortSignal },
  ) => {
    const requestId = transactionRequestRef.current + 1;
    transactionRequestRef.current = requestId;

    if (options.replace) {
      setTransactionsLoading(true);
      setTransactionsError(null);
    } else {
      setNextTransactionsLoading(true);
      setNextTransactionsError(null);
    }

    try {
      const transactionQuery: { page: number; pageSize: number; signal?: AbortSignal } = {
        page,
        pageSize: BANK_TRANSACTION_PAGE_SIZE,
      };
      if (options.signal) {
        transactionQuery.signal = options.signal;
      }

      const data = await getTransactions(transactionQuery);

      if (options.signal?.aborted || transactionRequestRef.current !== requestId) {
        return;
      }

      setTransactions((currentTransactions) => (
        options.replace
          ? mergeTransactionPages([], data.items)
          : mergeTransactionPages(currentTransactions, data.items)
      ));
      setTransactionPage(data.page);
      setHasMoreTransactions(getHasMoreTransactions(data));
      setTransactionsError(null);
      setNextTransactionsError(null);
    } catch (error) {
      if (isAbortError(error, options.signal)) {
        return;
      }

      const message = 'Failed to fetch transactions.';
      if (options.replace) {
        setTransactionsError(message);
      } else {
        setNextTransactionsError('Could not load more transactions. Your current history is still shown.');
      }
      showError(message);
    } finally {
      if (transactionRequestRef.current === requestId) {
        if (options.replace) {
          setTransactionsLoading(false);
        } else {
          setNextTransactionsLoading(false);
        }
      }
    }
  }, [showError]);

  useEffect(() => {
    if (activeView !== 'portal') {
      return undefined;
    }

    const controller = new AbortController();

    void fetchTransactionsPage(1, { replace: true, signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [activeView, fetchTransactionsPage]);

  const handleLoadMoreTransactions = useCallback(() => {
    if (transactionsLoading || nextTransactionsLoading || !hasMoreTransactions) {
      return;
    }

    void fetchTransactionsPage(transactionPage + 1, { replace: false });
  }, [
    fetchTransactionsPage,
    hasMoreTransactions,
    nextTransactionsLoading,
    transactionPage,
    transactionsLoading,
  ]);

  if (activeView !== 'portal') {
    const handleReturnToBank = () => setBankView('portal');
    const handleViewHistory = () => setBankView('portal');
    const activePanel = activeView === 'merchant'
      ? <MerchantPanel />
      : activeView === 'deposit'
        ? <DepositPanel onBackToBank={handleReturnToBank} onViewHistory={handleViewHistory} />
        : <WithdrawPanel onBackToBank={handleReturnToBank} onViewHistory={handleViewHistory} />;
    const panelContent = activeView === 'merchant'
      ? activePanel
      : <TonConnectRouteProvider>{activePanel}</TonConnectRouteProvider>;

    return (
      <div className="space-y-4">
        <SketchyButton
          className="text-sm font-bold uppercase underline hover:opacity-70 transition-opacity mb-4 inline-block"
          onClick={() => setBankView('portal')}
          type="button"
        >
          {'←'} Back to Bank
        </SketchyButton>
        <Suspense fallback={<RouteLoading message="Loading bank portal…" />}>
          {panelContent}
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
          <SketchyButton className="w-full" onClick={() => setBankView('deposit')}>
            Deposit USDT
          </SketchyButton>
        </SketchyContainer>

        <SketchyContainer roughness={1} className="bg-white/85 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-2 transition-transform shadow-xl">
          <div className="rough-border mb-4 flex size-20 items-center justify-center bg-danger-bg">
            <ArrowUpRight size={40} className="text-danger-text" />
          </div>
          <h2 className="text-2xl font-semibold uppercase tracking-tighter mb-2">Withdraw</h2>
          <p className="text-xs font-mono font-bold opacity-50 mb-6">USDT to a TON wallet</p>
          <SketchyButton className="w-full" onClick={() => setBankView('withdraw')}>
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
            onClick={() => setBankView('merchant')}
          >
            Buy / Sell via Fiat
          </SketchyButton>
        </SketchyContainer>
      </div>

      <div className="mt-16 rough-border bg-white p-8 relative shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <History size={32} className="text-ink-black opacity-70" />
          <h2 className="text-3xl font-semibold italic tracking-tighter uppercase underline decoration-wavy">
            Transaction History
          </h2>
        </div>

        <div className="space-y-4">
          {transactionsLoading && transactions.length === 0 ? (
            <EmptyState>Loading transactions...</EmptyState>
          ) : transactionsError && transactions.length === 0 ? (
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
                    className={`font-bold text-2xl tracking-tighter ${moneyToNumber(transaction.amount) > 0 ? 'text-success-text' : 'text-danger-text'}`}
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

          {transactions.length > 0 ? (
            <div className="flex flex-col items-center gap-3 pt-2">
              {nextTransactionsError ? (
                <p className="text-center text-sm font-semibold text-danger-text" role="alert">
                  {nextTransactionsError}
                </p>
              ) : null}
              {hasMoreTransactions ? (
                <SketchyButton
                  disabled={transactionsLoading || nextTransactionsLoading}
                  onClick={handleLoadMoreTransactions}
                  type="button"
                >
                  {nextTransactionsLoading ? 'Loading...' : 'Load more'}
                </SketchyButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BankPage;
