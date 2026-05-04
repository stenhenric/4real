import { startTransition, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownUp, BellDot, Landmark, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useToast } from '../../app/ToastProvider';
import { RouteLoading } from '../../app/RouteLoading';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { getMerchantDashboard } from '../../services/merchant-dashboard.service';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import type { MerchantDashboardDTO } from '../../types/api';
import { formatDateTime, formatMoney } from '../../features/merchant/format';

export interface MerchantOutletContext {
  dashboard: MerchantDashboardDTO | null;
  status: 'loading' | 'ready' | 'error';
  isRefreshing: boolean;
  error: string | null;
  refreshDashboard: () => Promise<void>;
}

const NAV_ITEMS = [
  { label: 'Overview', to: '/merchant', icon: ShieldCheck },
  { label: 'Order Desk', to: '/merchant/orders', icon: ArrowDownUp },
  { label: 'Deposits', to: '/merchant/deposits', icon: Landmark },
  { label: 'Liquidity', to: '/merchant/liquidity', icon: Wallet },
  { label: 'Alerts', to: '/merchant/alerts', icon: BellDot },
] as const;

export function useMerchantOutletContext() {
  return useOutletContext<MerchantOutletContext>();
}

function buildStatusLabel(dashboard: MerchantDashboardDTO | null, error: string | null) {
  if (!dashboard) {
    if (error) {
      return {
        label: 'Dashboard unavailable',
        tone: 'text-ink-red bg-red-50 border-red-200',
      };
    }

    return {
      label: 'Loading status',
      tone: 'text-ink-black/60 bg-white',
    };
  }

  const criticalCount = dashboard.alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = dashboard.alerts.filter((alert) => alert.severity === 'warning').length;

  if (criticalCount > 0) {
    return {
      label: `${criticalCount} critical issue${criticalCount === 1 ? '' : 's'}`,
      tone: 'text-ink-red bg-red-50 border-red-200',
    };
  }

  if (warningCount > 0) {
    return {
      label: `${warningCount} warning${warningCount === 1 ? '' : 's'}`,
      tone: 'text-yellow-800 bg-yellow-50 border-yellow-200',
    };
  }

  return {
    label: 'Systems stable',
    tone: 'text-green-700 bg-green-50 border-green-200',
  };
}

function getSectionLabel(pathname: string) {
  if (pathname === '/merchant') {
    return 'Overview';
  }

  if (pathname.startsWith('/merchant/orders')) {
    return 'Order Desk';
  }

  if (pathname.startsWith('/merchant/deposits')) {
    return 'Deposits';
  }

  if (pathname.startsWith('/merchant/liquidity')) {
    return 'Liquidity';
  }

  return 'Alerts';
}

export function MerchantLayout() {
  const location = useLocation();
  const { error: showError } = useToast();
  const [dashboard, setDashboard] = useState<MerchantDashboardDTO | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (mode: 'initial' | 'manual' | 'poll', signal?: AbortSignal) => {
    if (mode === 'initial') {
      setStatus((current) => current === 'ready' ? current : 'loading');
      setError(null);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextDashboard = await getMerchantDashboard(signal);
      startTransition(() => {
        setDashboard(nextDashboard);
        setStatus('ready');
        setError(null);
        setIsRefreshing(false);
      });
    } catch (loadError) {
      if (isAbortError(loadError)) {
        return;
      }

      if (loadError instanceof ApiClientError && isHandledAuthRedirectCode(loadError.code)) {
        setIsRefreshing(false);
        return;
      }

      const message = loadError instanceof Error ? loadError.message : 'Failed to load merchant dashboard.';
      setIsRefreshing(false);
      setError(message);
      if (!dashboard) {
        setStatus('error');
      }
      if (mode === 'manual') {
        showError(message);
      }
    }
  }, [dashboard, showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard('initial', controller.signal);

    const interval = window.setInterval(() => {
      void loadDashboard('poll');
    }, 30_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const pendingBadge = dashboard?.overview.pendingOrderCount ?? 0;
  const alertBadge = dashboard?.alerts.filter((alert) => alert.severity !== 'info').length ?? 0;
  const unmatchedDepositBadge = dashboard?.liquidity.unresolvedDepositCount ?? 0;
  const statusBadge = buildStatusLabel(dashboard, error);
  const currentSectionLabel = getSectionLabel(location.pathname);
  const getNavBadge = (to: typeof NAV_ITEMS[number]['to']) => (
    to === '/merchant/orders'
      ? pendingBadge
      : to === '/merchant/deposits'
        ? unmatchedDepositBadge
      : to === '/merchant/alerts'
        ? alertBadge
        : null
  );
  const routeContext: MerchantOutletContext = {
    dashboard,
    status,
    isRefreshing,
    error,
    refreshDashboard: async () => {
      await loadDashboard('manual');
    },
  };

  return (
    <div className="min-h-screen bg-paper paper-texture">
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 flex-col gap-4 lg:flex">
          <div className="rough-border bg-white/90 p-5 shadow-lg">
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.35em] opacity-50">
              Merchant Ops
            </p>
            <h1 className="mt-2 text-4xl font-bold italic tracking-tight text-ink-blue">
              Treasury Desk
            </h1>
            <p className="mt-3 text-sm font-mono opacity-70">
              Admin-only workflow for P2P liquidity, order review, and operational alerts.
            </p>
          </div>

          <nav className="rough-border bg-white/85 p-3 shadow-lg">
            {NAV_ITEMS.map((item) => {
              const badge = getNavBadge(item.to);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/merchant'}
                  className={({ isActive }) => cn(
                    'mb-2 flex items-center justify-between rounded-2xl px-4 py-3 text-lg font-bold transition-colors last:mb-0',
                    isActive
                      ? 'bg-ink-blue/10 text-ink-blue'
                      : 'text-ink-black/70 hover:bg-black/5 hover:text-ink-black',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon size={20} />
                    {item.label}
                  </span>
                  {badge && badge > 0 ? (
                    <span className="rounded-full bg-ink-red px-2 py-0.5 text-xs font-mono font-bold text-white">
                      {badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="rough-border bg-white/80 p-4 shadow-lg">
            <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Reserve Snapshot</p>
            <div className="mt-3 space-y-3 font-mono text-sm">
              <div className="flex items-center justify-between">
                <span className="opacity-60">On-chain USDT</span>
                <span className="font-bold text-ink-blue">
                  {formatMoney(dashboard?.liquidity.onChainUsdtBalanceUsdt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="opacity-60">Customer liabilities</span>
                <span className="font-bold">{formatMoney(dashboard?.liquidity.ledgerUsdtBalanceUsdt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="opacity-60">Open deposit reviews</span>
                <span className="font-bold">{unmatchedDepositBadge}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="opacity-60">Pending orders</span>
                <span className="font-bold">{pendingBadge}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="rough-border sticky top-4 z-30 mb-6 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-mono font-bold uppercase tracking-[0.35em] opacity-50">
                  {currentSectionLabel}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold',
                    statusBadge.tone,
                  )}>
                    {statusBadge.label}
                  </span>
                  <span className="text-sm font-mono opacity-60">
                    Last sync {dashboard ? formatDateTime(dashboard.generatedAt) : 'pending'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-black/10 bg-black/5 px-4 py-2 text-sm font-mono">
                  TON gas {formatMoney(dashboard?.liquidity.tonBalanceTon)}
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-full border-2 border-ink-black px-4 py-2 text-sm font-bold transition-colors hover:bg-black/5 disabled:opacity-60"
                  onClick={() => {
                    void loadDashboard('manual');
                  }}
                  disabled={isRefreshing}
                  type="button"
                >
                  <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-mono text-ink-red">
                {error}
              </div>
            ) : null}

            <div className="mt-4 space-y-3 lg:hidden">
              <nav aria-label="Merchant sections" className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex w-max gap-2">
                  {NAV_ITEMS.map((item) => {
                    const badge = getNavBadge(item.to);

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/merchant'}
                        className={({ isActive }) => cn(
                          'inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors',
                          isActive
                            ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                            : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5 hover:text-ink-black',
                        )}
                      >
                        <item.icon size={16} />
                        <span>{item.label}</span>
                        {badge && badge > 0 ? (
                          <span className="rounded-full bg-ink-red px-2 py-0.5 text-[11px] font-mono font-bold text-white">
                            {badge}
                          </span>
                        ) : null}
                      </NavLink>
                    );
                  })}
                </div>
              </nav>

              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Pocket Snapshot</p>
                <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm">
                  <div>
                    <p className="opacity-50">Pending orders</p>
                    <p className="mt-1 font-bold">{pendingBadge}</p>
                  </div>
                  <div>
                    <p className="opacity-50">Deposit reviews</p>
                    <p className="mt-1 font-bold">{unmatchedDepositBadge}</p>
                  </div>
                  <div>
                    <p className="opacity-50">On-chain USDT</p>
                    <p className="mt-1 font-bold text-ink-blue">
                      {formatMoney(dashboard?.liquidity.onChainUsdtBalanceUsdt)}
                    </p>
                  </div>
                  <div>
                    <p className="opacity-50">Customer liabilities</p>
                    <p className="mt-1 font-bold">
                      {formatMoney(dashboard?.liquidity.ledgerUsdtBalanceUsdt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {status === 'loading' && !dashboard ? (
            <RouteLoading message="Loading treasury ops..." />
          ) : (
            <Outlet context={routeContext} />
          )}
        </div>
      </div>
    </div>
  );
}
