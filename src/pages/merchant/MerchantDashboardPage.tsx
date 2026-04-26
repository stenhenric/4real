import { AlertTriangle, ArrowDownUp, ArrowUpRight, Clock3, ShieldAlert, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { MerchantPageFallback } from '../../components/merchant/MerchantPageFallback';
import { formatCompactNumber, formatDateTime, formatMoney, formatRelativeMinutes } from '../../features/merchant/format';

export default function MerchantDashboardPage() {
  const { dashboard } = useMerchantOutletContext();

  if (!dashboard) {
    return (
      <MerchantPageFallback
        title="Treasury Overview"
        description="Overview cards, throughput, review queue, and alert feed will appear after the shared merchant dashboard request succeeds."
      />
    );
  }

  const criticalCount = dashboard.alerts.filter((alert) => alert.severity === 'critical').length;
  const maxVolume = Math.max(...dashboard.overview.volumeSeries.map((point) => point.completedVolumeUsdt), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-bold italic tracking-tight">Treasury Overview</h2>
          <p className="text-sm font-mono opacity-60">
            Real-time merchant operations view generated at {formatDateTime(dashboard.generatedAt)}.
          </p>
        </div>
        <Link
          to="/merchant/orders"
          className="inline-flex items-center gap-2 self-start rounded-full border-2 border-ink-blue px-4 py-2 text-sm font-bold text-ink-blue transition-colors hover:bg-ink-blue/10"
        >
          <ArrowDownUp size={16} />
          Review Queue
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Pending Orders</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-bold italic text-ink-blue">{dashboard.overview.pendingOrderCount}</p>
              <p className="mt-2 text-sm font-mono opacity-60">
                Oldest wait {dashboard.overview.oldestPendingMinutes === null ? 'none' : formatRelativeMinutes(dashboard.overview.oldestPendingMinutes)}
              </p>
            </div>
            <Clock3 className="text-ink-blue/40" size={34} />
          </div>
        </SketchyContainer>

        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">High-Risk Queue</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-bold italic text-ink-red">{dashboard.overview.highRiskPendingOrderCount}</p>
              <p className="mt-2 text-sm font-mono opacity-60">{criticalCount} critical alert{criticalCount === 1 ? '' : 's'} open</p>
            </div>
            <ShieldAlert className="text-ink-red/40" size={34} />
          </div>
        </SketchyContainer>

        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">24h Completed Volume</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-bold italic">{formatCompactNumber(dashboard.overview.completedVolume24hUsdt)}</p>
              <p className="mt-2 text-sm font-mono opacity-60">
                {dashboard.overview.completedTrades24h} completed trade{dashboard.overview.completedTrades24h === 1 ? '' : 's'}
              </p>
            </div>
            <ArrowUpRight className="text-green-700/40" size={34} />
          </div>
        </SketchyContainer>

        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Reserve Coverage</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-bold italic">
                {dashboard.liquidity.usdtDeltaUsdt === null
                  ? 'Unavailable'
                  : `${dashboard.liquidity.usdtDeltaUsdt >= 0 ? '+' : ''}${formatMoney(dashboard.liquidity.usdtDeltaUsdt)}`}
              </p>
              <p className="mt-2 text-sm font-mono opacity-60">On-chain minus internal ledger</p>
            </div>
            <Wallet className="text-ink-blue/40" size={34} />
          </div>
        </SketchyContainer>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <SketchyContainer className="bg-white">
          <div className="flex items-center justify-between border-b border-black/10 pb-3">
            <div>
              <h3 className="text-2xl font-bold italic">24h Order Throughput</h3>
              <p className="text-sm font-mono opacity-60">Completed P2P volume grouped into four-hour buckets.</p>
            </div>
            <Link to="/merchant/liquidity" className="text-sm font-bold text-ink-blue hover:underline">
              Open Liquidity
            </Link>
          </div>
          <div className="mt-6">
            <div className="flex h-64 items-end gap-3">
              {dashboard.overview.volumeSeries.map((point) => (
                <div key={point.bucketStart} className="flex flex-1 flex-col items-center gap-3">
                  <div className="w-full rounded-t-[24px] border-2 border-ink-black/20 bg-[repeating-linear-gradient(-45deg,rgba(26,54,93,0.15),rgba(26,54,93,0.15)_10px,rgba(26,54,93,0.08)_10px,rgba(26,54,93,0.08)_20px)] px-2 pt-2" style={{ height: `${Math.max(14, (point.completedVolumeUsdt / maxVolume) * 100)}%` }}>
                    <div className="text-center text-[11px] font-mono font-bold text-ink-blue">
                      {point.completedVolumeUsdt > 0 ? formatCompactNumber(point.completedVolumeUsdt) : '0'}
                    </div>
                  </div>
                  <div className="text-center text-[11px] font-mono opacity-60">{point.bucketLabel}</div>
                </div>
              ))}
            </div>
          </div>
        </SketchyContainer>

        <SketchyContainer className="bg-white">
          <div className="flex items-center justify-between border-b border-black/10 pb-3">
            <div>
              <h3 className="text-2xl font-bold italic">Immediate Action Queue</h3>
              <p className="text-sm font-mono opacity-60">Highest priority pending orders, sorted by risk and wait time.</p>
            </div>
            <Link to="/merchant/orders" className="text-sm font-bold text-ink-blue hover:underline">
              View all
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {dashboard.actionQueue.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-black/10 px-6 py-10 text-center text-sm font-mono opacity-50">
                No pending orders are waiting for treasury review.
              </div>
            ) : (
              dashboard.actionQueue.slice(0, 5).map((order) => (
                <div key={order.id} className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${order.type === 'BUY' ? 'bg-ink-blue/10 text-ink-blue' : 'bg-ink-red/10 text-ink-red'}`}>
                          {order.type}
                        </span>
                        <span className="font-mono text-sm opacity-60">{order.user.username}</span>
                      </div>
                      <p className="mt-2 text-2xl font-bold italic">{formatMoney(order.amount)} USDT</p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${order.riskLevel === 'high' ? 'bg-red-100 text-ink-red' : order.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                        {order.riskLevel} risk
                      </span>
                      <p className="mt-2 text-sm font-mono opacity-60">{formatRelativeMinutes(order.waitMinutes)}</p>
                    </div>
                  </div>
                  {order.riskFlags.length > 0 ? (
                    <p className="mt-3 text-sm font-mono opacity-70">{order.riskFlags.join(' • ')}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SketchyContainer>
      </div>

      <SketchyContainer className="bg-white">
        <div className="flex items-center justify-between border-b border-black/10 pb-3">
          <div>
            <h3 className="text-2xl font-bold italic">Alert Stream</h3>
            <p className="text-sm font-mono opacity-60">Operational issues that need treasury or support attention.</p>
          </div>
          <Link to="/merchant/alerts" className="text-sm font-bold text-ink-blue hover:underline">
            Open alerts
          </Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {dashboard.alerts.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-black/10 px-6 py-10 text-center text-sm font-mono opacity-50 md:col-span-3">
              No active alerts. Treasury operations are currently stable.
            </div>
          ) : (
            dashboard.alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${alert.severity === 'critical' ? 'bg-red-100 text-ink-red' : alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-ink-blue'}`}>
                    {alert.severity}
                  </span>
                  <AlertTriangle size={18} className={alert.severity === 'critical' ? 'text-ink-red' : alert.severity === 'warning' ? 'text-yellow-800' : 'text-ink-blue'} />
                </div>
                <h4 className="mt-3 text-xl font-bold italic">{alert.title}</h4>
                <p className="mt-2 text-sm font-mono opacity-70">{alert.description}</p>
              </div>
            ))
          )}
        </div>
      </SketchyContainer>
    </div>
  );
}
