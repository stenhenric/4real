import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Server, Wallet } from 'lucide-react';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { MerchantPageFallback } from '../../components/merchant/MerchantPageFallback';
import { updateMerchantAdminConfig } from '../../services/merchant-config.service';
import type { MerchantConfigDTO } from '../../types/api';
import { formatDateTime, formatMoney } from '../../features/merchant/format';

interface MerchantConfigFormState {
  mpesaNumber: string;
  walletAddress: string;
  instructions: string;
  buyRateKesPerUsdt: string;
  sellRateKesPerUsdt: string;
}

function toFormState(config: MerchantConfigDTO): MerchantConfigFormState {
  return {
    mpesaNumber: config.mpesaNumber,
    walletAddress: config.walletAddress,
    instructions: config.instructions,
    buyRateKesPerUsdt: String(config.buyRateKesPerUsdt),
    sellRateKesPerUsdt: String(config.sellRateKesPerUsdt),
  };
}

export default function LiquidityPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { success, error: showError } = useToast();
  const [formState, setFormState] = useState<MerchantConfigFormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dashboard || dirty) {
      return;
    }

    setFormState(toFormState(dashboard.liquidity.merchantConfig));
  }, [dashboard, dirty]);

  if (!dashboard) {
    return (
      <MerchantPageFallback
        title="Liquidity & Wallets"
        description="Reserve balances, worker health, and merchant settlement controls will appear after the shared merchant dashboard request succeeds."
      />
    );
  }

  const criticalLiquidityAlerts = dashboard.alerts.filter((alert) =>
    alert.targetPath === '/merchant/liquidity' && alert.severity === 'critical',
  );

  const handleChange = (
    field: keyof MerchantConfigFormState,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const nextValue = event.target.value;
    setFormState((current) => ({
      ...(current ?? toFormState(dashboard.liquidity.merchantConfig)),
      [field]: nextValue,
    }));
    setDirty(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState) {
      return;
    }

    const buyRateKesPerUsdt = Number(formState.buyRateKesPerUsdt);
    const sellRateKesPerUsdt = Number(formState.sellRateKesPerUsdt);

    if (!Number.isFinite(buyRateKesPerUsdt) || buyRateKesPerUsdt <= 0) {
      showError('Buy rate must be greater than 0.');
      return;
    }

    if (!Number.isFinite(sellRateKesPerUsdt) || sellRateKesPerUsdt <= 0) {
      showError('Sell rate must be greater than 0.');
      return;
    }

    setSaving(true);

    try {
      const updatedConfig = await updateMerchantAdminConfig({
        mpesaNumber: formState.mpesaNumber.trim(),
        walletAddress: formState.walletAddress.trim(),
        instructions: formState.instructions.trim(),
        buyRateKesPerUsdt,
        sellRateKesPerUsdt,
      });

      setFormState(toFormState(updatedConfig));
      setDirty(false);
      success('Merchant settlement config updated.');
      await refreshDashboard();
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update merchant config.');
    } finally {
      setSaving(false);
    }
  };

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
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Customer Liabilities</p>
          <p className="mt-4 text-4xl font-bold italic">{formatMoney(dashboard.liquidity.ledgerUsdtBalanceUsdt)}</p>
          <p className="mt-2 text-sm font-mono opacity-60">User balances excluding platform commission</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Coverage Delta</p>
          <p className="mt-4 text-4xl font-bold italic">
            {dashboard.liquidity.usdtDeltaUsdt === null
              ? 'Unavailable'
              : `${dashboard.liquidity.usdtDeltaUsdt >= 0 ? '+' : ''}${formatMoney(dashboard.liquidity.usdtDeltaUsdt)}`}
          </p>
          <p className="mt-2 text-sm font-mono opacity-60">On-chain reserve minus ledger</p>
          <p className="mt-1 text-xs font-mono opacity-40">Commission is tracked separately below.</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Hotwallet TON Gas</p>
          <p className="mt-4 text-4xl font-bold italic">{formatMoney(dashboard.liquidity.tonBalanceTon)}</p>
          <p className="mt-2 text-sm font-mono opacity-60">Operational gas available</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white border-ink-blue border-2">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-ink-blue">Platform Commission</p>
          <p className="mt-4 text-4xl font-bold italic text-ink-blue">{formatMoney(dashboard.liquidity.systemCommissionUsdt)}</p>
          <p className="mt-2 text-sm font-mono text-ink-blue/60">Total earned from matches</p>
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
            <div className="border-b border-black/10 pb-3">
              <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Merchant Settlement Config</p>
              <p className="mt-2 text-sm font-mono opacity-60">
                Rates are expressed as {dashboard.liquidity.merchantConfig.fiatCurrency} per 1 USDT.
              </p>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSave}>
              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-mpesa-number">
                  M-Pesa number
                </label>
                <input
                  className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
                  id="merchant-mpesa-number"
                  onChange={(event) => handleChange('mpesaNumber', event)}
                  type="text"
                  value={formState?.mpesaNumber ?? ''}
                />
              </div>

              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-wallet-address">
                  Wallet address
                </label>
                <input
                  className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
                  id="merchant-wallet-address"
                  onChange={(event) => handleChange('walletAddress', event)}
                  type="text"
                  value={formState?.walletAddress ?? ''}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                  <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-buy-rate">
                    Buy rate ({dashboard.liquidity.merchantConfig.fiatCurrency}/USDT)
                  </label>
                  <input
                    className="mt-2 w-full bg-transparent text-2xl font-bold italic focus:outline-none"
                    id="merchant-buy-rate"
                    inputMode="decimal"
                    min="0.01"
                    onChange={(event) => handleChange('buyRateKesPerUsdt', event)}
                    step="0.01"
                    type="number"
                    value={formState?.buyRateKesPerUsdt ?? ''}
                  />
                </div>
                <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                  <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-sell-rate">
                    Sell rate ({dashboard.liquidity.merchantConfig.fiatCurrency}/USDT)
                  </label>
                  <input
                    className="mt-2 w-full bg-transparent text-2xl font-bold italic focus:outline-none"
                    id="merchant-sell-rate"
                    inputMode="decimal"
                    min="0.01"
                    onChange={(event) => handleChange('sellRateKesPerUsdt', event)}
                    step="0.01"
                    type="number"
                    value={formState?.sellRateKesPerUsdt ?? ''}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Fiat currency</p>
                <p className="mt-2 text-sm font-mono">{dashboard.liquidity.merchantConfig.fiatCurrency}</p>
              </div>

              <div className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
                <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-instructions">
                  Instructions
                </label>
                <textarea
                  className="mt-2 min-h-28 w-full resize-y bg-transparent text-sm font-mono focus:outline-none"
                  id="merchant-instructions"
                  onChange={(event) => handleChange('instructions', event)}
                  value={formState?.instructions ?? ''}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-mono opacity-50">
                  {dirty ? 'Unsaved changes' : 'Config saved'}
                </p>
                <SketchyButton disabled={!dirty || saving} type="submit">
                  {saving ? 'Saving...' : 'Save Merchant Config'}
                </SketchyButton>
              </div>
            </form>
          </SketchyContainer>
        </div>
      </div>
    </div>
  );
}
