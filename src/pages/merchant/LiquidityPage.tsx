import { Activity, ArrowDownToLine, ArrowUpFromLine, Server, Wallet } from 'lucide-react';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { formatDateTime, formatMoney } from '../../features/merchant/format';

export default function LiquidityPage() {
  const { dashboard } = useMerchantOutletContext();

  if (!dashboard) {
    return null;
  }

  const criticalLiquidityAlerts = dashboard.alerts.filter((alert) =>
    alert.targetPath === '/merchant/liquidity' && alert.severity === 'critical',
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-bold italic tracking-tight">Liquidity & Wallets</h2>
        <p className="text-sm font-mono opacity-60">
          Monitor reserves, hot-wallet health, worker status, and unresolved treasury flow.
        </p>
      </div>

      {criticalLiquidityAlerts.length > 0 ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-mono text-ink-red">
          {criticalLiquidityAlerts.length} critical liquidity issue{criticalLiquidityAlerts.length === 1 ? '' : 's'} require action.
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">On-chain USDT</p>
          <p className="mt-4 text-4xl font-bold italic text-ink-blue">{formatMoney(dashboard.liquidity.onChainUsdtBalanceUsdt)}</p>
          <p className="mt-2 text-sm font-mono opacity-60">Hot wallet jetton reserve</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Ledger Liabilities</p>
          <p className="mt-4 text-4xl font-bold italic">{formatMoney(dashboard.liquidity.ledgerUsdtBalanceUsdt)}</p>
          <p className="mt-2 text-sm font-mono opacity-60">Aggregate user balances</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Coverage Delta</p>
          <p className="mt-4 text-4xl font-bold italic">
            {dashboard.liquidity.usdtDeltaUsdt === null
              ? 'Unavailable'
              : `${dashboard.liquidity.usdtDeltaUsdt >= 0 ? '+' : ''}${formatMoney(dashboard.liquidity.usdtDeltaUsdt)}`}
          </p>
          <p className="mt-2 text-sm font-mono opacity-60">On-chain reserve minus ledger</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">TON Gas Balance</p>
          <p className="mt-4 text-4xl font-bold italic">{formatMoney(dashboard.liquidity.tonBalanceTon)}</p>
          <p className="mt-2 text-sm font-mono opacity-60">Operational gas available</p>
        </SketchyContainer>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <SketchyContainer className="bg-white">
            <div className="flex items-center gap-3 border-b border-black/10 pb-3">
              <Wallet className="text-ink-blue" size={22} />
              <div>
                <h3 className="text-2xl font-bold italic">Wallet Addresses</h3>
                <p className="text-sm font-mono opacity-60">Primary operational addresses used by the treasury stack.</p>
              </div>
            </div>
            <div className="mt-4 space-y-4 font-mono text-sm">
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Hot wallet</p>
                <p className="mt-2 break-all">{dashboard.liquidity.hotWalletAddress}</p>
              </div>
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Hot USDT jetton wallet</p>
                <p className="mt-2 break-all">{dashboard.liquidity.hotJettonWallet}</p>
              </div>
            </div>
          </SketchyContainer>

          <SketchyContainer className="bg-white">
            <div className="flex items-center gap-3 border-b border-black/10 pb-3">
              <Activity className="text-ink-blue" size={22} />
              <div>
                <h3 className="text-2xl font-bold italic">Flow Summary</h3>
                <p className="text-sm font-mono opacity-60">Confirmed deposit and withdrawal movement over the last 24 hours.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-black/10 bg-green-50 px-4 py-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-green-800">
                  <ArrowDownToLine size={16} />
                  Deposits 24h
                </p>
                <p className="mt-3 text-3xl font-bold italic text-green-700">
                  {formatMoney(dashboard.liquidity.depositFlow24hUsdt)} USDT
                </p>
              </div>
              <div className="rounded-3xl border border-black/10 bg-red-50 px-4 py-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-ink-red">
                  <ArrowUpFromLine size={16} />
                  Withdrawals 24h
                </p>
                <p className="mt-3 text-3xl font-bold italic text-ink-red">
                  {formatMoney(dashboard.liquidity.withdrawalFlow24hUsdt)} USDT
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Queued withdrawals</p>
                <p className="mt-3 text-3xl font-bold italic">{dashboard.liquidity.queuedWithdrawalCount}</p>
              </div>
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Unmatched deposits</p>
                <p className="mt-3 text-3xl font-bold italic">{dashboard.liquidity.unresolvedDepositCount}</p>
              </div>
            </div>
          </SketchyContainer>
        </div>

        <div className="space-y-6">
          <SketchyContainer className="bg-white">
            <div className="flex items-center gap-3 border-b border-black/10 pb-3">
              <Server className="text-ink-blue" size={22} />
              <div>
                <h3 className="text-2xl font-bold italic">Background Workers</h3>
                <p className="text-sm font-mono opacity-60">Runtime state reported by the server process.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {dashboard.liquidity.jobs.map((job) => (
                <div key={job.key} className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{job.label}</p>
                      <p className="text-xs font-mono opacity-50">
                        Last success {formatDateTime(job.lastSucceededAt)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${job.state === 'critical' ? 'bg-red-100 text-ink-red' : job.state === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                      {job.state}
                    </span>
                  </div>
                  {job.lastError ? (
                    <p className="mt-3 text-sm font-mono opacity-70">{job.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </SketchyContainer>

          <SketchyContainer className="bg-white">
            <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Merchant Settlement Config</p>
            <div className="mt-4 space-y-3 font-mono text-sm">
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">M-Pesa number</p>
                <p className="mt-2 break-all">{dashboard.liquidity.merchantConfig.mpesaNumber}</p>
              </div>
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Wallet address</p>
                <p className="mt-2 break-all">{dashboard.liquidity.merchantConfig.walletAddress}</p>
              </div>
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Instructions</p>
                <p className="mt-2 whitespace-pre-wrap">{dashboard.liquidity.merchantConfig.instructions}</p>
              </div>
            </div>
          </SketchyContainer>
        </div>
      </div>
    </div>
  );
}
