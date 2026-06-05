import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Server, Wallet } from 'lucide-react';
import { ApiClientError } from '../../services/api/apiClient';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { MerchantPageFallback } from '../../components/merchant/MerchantPageFallback';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { updateMerchantAdminConfig } from '../../services/merchant-config.service';
import type { MerchantConfigDTO, MerchantDashboardDTO } from '../../types/api';
import { formatDateTime, formatMoney } from '../../features/merchant/format';
import { formatWalletAddressForDisplay } from '../../features/bank/walletAddressPresentation';
import { moneyToNumber, normalizeFixedScaleAmount } from '../../utils/exact-money.ts';
import { getApiErrorMessage } from '../../utils/errors';

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

function LiquidityHeader({ criticalAlertCount }: { criticalAlertCount: number }) {
  return (
    <>
      <div>
        <h2 className="text-4xl font-semibold italic tracking-tight">Liquidity & Wallets</h2>
        <p className="text-sm font-mono opacity-60">
          Monitor reserves, hot-wallet health, worker status, and unresolved treasury flow.
        </p>
      </div>

      {criticalAlertCount > 0 ? (
        <div className="flex flex-col gap-2 border border-danger-border bg-danger-bg px-5 py-4 text-sm font-mono text-danger-text sm:flex-row sm:items-center">
          <StatusBadge tone="danger">Critical</StatusBadge>
          <span>
            {criticalAlertCount} critical liquidity issue{criticalAlertCount === 1 ? '' : 's'} require action.
          </span>
        </div>
      ) : null}
    </>
  );
}

function LiquidityMetricsGrid({ liquidity }: { liquidity: MerchantDashboardDTO['liquidity'] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <SketchyContainer className="bg-white">
        <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">On-chain USDT</p>
        <p className="mt-4 text-4xl font-bold italic text-ink-blue">{formatMoney(liquidity.onChainUsdtBalanceUsdt)}</p>
        <p className="mt-2 text-sm font-mono opacity-60">Hot wallet jetton reserve</p>
      </SketchyContainer>
      <SketchyContainer className="bg-white">
        <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Customer Liabilities</p>
        <p className="mt-4 text-4xl font-bold italic">{formatMoney(liquidity.ledgerUsdtBalanceUsdt)}</p>
        <p className="mt-2 text-sm font-mono opacity-60">User balances excluding platform commission</p>
      </SketchyContainer>
      <SketchyContainer className="bg-white">
        <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Coverage Delta</p>
        <p className="mt-4 text-4xl font-bold italic">
          {liquidity.usdtDeltaUsdt === null
            ? 'Unavailable'
            : `${moneyToNumber(liquidity.usdtDeltaUsdt) >= 0 ? '+' : ''}${formatMoney(liquidity.usdtDeltaUsdt)}`}
        </p>
        <p className="mt-2 text-sm font-mono opacity-60">On-chain reserve minus ledger</p>
        <p className="mt-1 text-xs font-mono opacity-40">Commission is tracked separately below.</p>
      </SketchyContainer>
      <SketchyContainer className="bg-white">
        <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Hotwallet TON Gas</p>
        <p className="mt-4 text-4xl font-bold italic">{formatMoney(liquidity.tonBalanceTon)}</p>
        <p className="mt-2 text-sm font-mono opacity-60">Operational gas available</p>
      </SketchyContainer>
      <SketchyContainer className="bg-white border-ink-blue border-2">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-ink-blue">Platform Commission</p>
        <p className="mt-4 text-4xl font-bold italic text-ink-blue">{formatMoney(liquidity.systemCommissionUsdt)}</p>
        <p className="mt-2 text-sm font-mono text-ink-blue/60">Total earned from matches</p>
      </SketchyContainer>
    </div>
  );
}

function WalletAddressesPanel({ liquidity }: { liquidity: MerchantDashboardDTO['liquidity'] }) {
  return (
    <SketchyContainer className="bg-white">
      <div className="flex items-center gap-3 border-b border-black/10 pb-3">
        <Wallet className="text-ink-blue" size={22} />
        <div>
          <h3 className="text-2xl font-semibold italic">Wallet Addresses</h3>
          <p className="text-sm font-mono opacity-60">Primary operational addresses used by the treasury stack.</p>
        </div>
      </div>
      <div className="mt-4 space-y-4 font-mono text-sm">
        <div className="border border-black/10 bg-black/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Hot wallet</p>
          <p className="mt-2 break-all" title={formatWalletAddressForDisplay(liquidity.hotWalletAddress)}>
            {formatWalletAddressForDisplay(liquidity.hotWalletAddress)}
          </p>
        </div>
        <div className="border border-black/10 bg-black/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Hot USDT jetton wallet</p>
          <p className="mt-2 break-all" title={formatWalletAddressForDisplay(liquidity.hotJettonWallet)}>
            {formatWalletAddressForDisplay(liquidity.hotJettonWallet)}
          </p>
        </div>
      </div>
    </SketchyContainer>
  );
}

function FlowSummaryPanel({ liquidity }: { liquidity: MerchantDashboardDTO['liquidity'] }) {
  return (
    <SketchyContainer className="bg-white">
      <div className="flex items-center gap-3 border-b border-black/10 pb-3">
        <Activity className="text-ink-blue" size={22} />
        <div>
          <h3 className="text-2xl font-semibold italic">Flow Summary</h3>
          <p className="text-sm font-mono opacity-60">Confirmed deposit and withdrawal movement over the last 24 hours.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="border border-success-border bg-success-bg p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-success-text">
            <ArrowDownToLine size={16} />
            Deposits 24h
          </p>
          <p className="mt-3 text-3xl font-bold italic text-success-text">
            {formatMoney(liquidity.depositFlow24hUsdt)} USDT
          </p>
        </div>
        <div className="border border-danger-border bg-danger-bg p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-danger-text">
            <ArrowUpFromLine size={16} />
            Withdrawals 24h
          </p>
          <p className="mt-3 text-3xl font-bold italic text-danger-text">
            {formatMoney(liquidity.withdrawalFlow24hUsdt)} USDT
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="border border-black/10 bg-black/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Queued withdrawals</p>
          <p className="mt-3 text-3xl font-bold italic">{liquidity.queuedWithdrawalCount}</p>
        </div>
        <div className="border border-black/10 bg-black/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Unmatched deposits</p>
          <p className="mt-3 text-3xl font-bold italic">{liquidity.unresolvedDepositCount}</p>
        </div>
      </div>
    </SketchyContainer>
  );
}

function WorkerStatusPanel({ liquidity }: { liquidity: MerchantDashboardDTO['liquidity'] }) {
  return (
    <SketchyContainer className="bg-white">
      <div className="flex items-center gap-3 border-b border-black/10 pb-3">
        <Server className="text-ink-blue" size={22} />
        <div>
          <h3 className="text-2xl font-semibold italic">Background Workers</h3>
          <p className="text-sm font-mono opacity-60">Runtime state reported by the server process.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {liquidity.jobs.map((job) => (
          <div key={job.key} className="border border-black/10 bg-black/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{job.label}</p>
                <p className="text-xs font-mono opacity-50">
                  Last success {formatDateTime(job.lastSucceededAt)}
                </p>
              </div>
              <StatusBadge tone={statusToneFromStatus(job.state)}>
                {job.state}
              </StatusBadge>
            </div>
            {job.lastError ? (
              <p className="mt-3 text-sm font-mono opacity-70">{job.lastError}</p>
            ) : null}
          </div>
        ))}
      </div>
    </SketchyContainer>
  );
}

function MerchantSettlementConfigForm({
  dirty,
  fiatCurrency,
  formState,
  onChange,
  onSave,
  saving,
}: {
  dirty: boolean;
  fiatCurrency: string;
  formState: MerchantConfigFormState;
  onChange: (field: keyof MerchantConfigFormState, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <SketchyContainer className="bg-white">
      <div className="border-b border-black/10 pb-3">
        <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Merchant Settlement Config</p>
        <p className="mt-2 text-sm font-mono opacity-60">
          Rates are expressed as {fiatCurrency} per 1 USDT.
        </p>
      </div>

      <form className="mt-4 space-y-4" onSubmit={onSave}>
        <div className="rough-border bg-black/5 p-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-mpesa-number">
            M-Pesa number
          </label>
          <input
            className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
            id="merchant-mpesa-number"
            onChange={(event) => onChange('mpesaNumber', event)}
            type="text"
            value={formState.mpesaNumber}
          />
        </div>

        <div className="rough-border bg-black/5 p-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-wallet-address">
            Wallet address
          </label>
          <input
            className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
            id="merchant-wallet-address"
            onChange={(event) => onChange('walletAddress', event)}
            type="text"
            value={formState.walletAddress}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rough-border bg-black/5 p-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-buy-rate">
              Buy rate ({fiatCurrency}/USDT)
            </label>
            <input
              className="mt-2 w-full bg-transparent text-2xl font-bold italic focus:outline-none"
              id="merchant-buy-rate"
              inputMode="decimal"
              min="0.01"
              onChange={(event) => onChange('buyRateKesPerUsdt', event)}
              step="0.01"
              type="number"
              value={formState.buyRateKesPerUsdt}
            />
          </div>
          <div className="rough-border bg-black/5 p-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-sell-rate">
              Sell rate ({fiatCurrency}/USDT)
            </label>
            <input
              className="mt-2 w-full bg-transparent text-2xl font-bold italic focus:outline-none"
              id="merchant-sell-rate"
              inputMode="decimal"
              min="0.01"
              onChange={(event) => onChange('sellRateKesPerUsdt', event)}
              step="0.01"
              type="number"
              value={formState.sellRateKesPerUsdt}
            />
          </div>
        </div>

        <div className="rough-border bg-black/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Fiat currency</p>
          <p className="mt-2 text-sm font-mono">{fiatCurrency}</p>
        </div>

        <div className="rough-border bg-black/5 p-4">
          <label className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50" htmlFor="merchant-instructions">
            Instructions
          </label>
          <textarea
            className="mt-2 min-h-28 w-full resize-y bg-transparent text-sm font-mono focus:outline-none"
            id="merchant-instructions"
            onChange={(event) => onChange('instructions', event)}
            value={formState.instructions}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-mono opacity-50">
            {dirty ? 'Unsaved changes' : 'Config saved'}
          </p>
          <SketchyButton disabled={!dirty || saving} type="submit">
            {saving ? 'Saving…' : 'Save Merchant Config'}
          </SketchyButton>
        </div>
      </form>
    </SketchyContainer>
  );
}

export default function LiquidityPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { success, error: showError } = useToast();
  const [draftState, setDraftState] = useState<MerchantConfigFormState | null>(null);
  const [saving, setSaving] = useState(false);

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
  const formState = draftState ?? toFormState(dashboard.liquidity.merchantConfig);
  const dirty = draftState !== null;

  const handleChange = (
    field: keyof MerchantConfigFormState,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const nextValue = event.target.value;
    setDraftState((current) => ({
      ...(current ?? formState),
      [field]: nextValue,
    }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let buyRateKesPerUsdt: string;
    let sellRateKesPerUsdt: string;
    try {
      buyRateKesPerUsdt = normalizeFixedScaleAmount(formState.buyRateKesPerUsdt, {
        allowZero: false,
        label: 'Buy rate',
        scale: 6,
      });
      sellRateKesPerUsdt = normalizeFixedScaleAmount(formState.sellRateKesPerUsdt, {
        allowZero: false,
        label: 'Sell rate',
        scale: 6,
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Merchant rates must be valid decimal amounts.');
      return;
    }

    setSaving(true);

    try {
      await updateMerchantAdminConfig({
        mpesaNumber: formState.mpesaNumber.trim(),
        walletAddress: formState.walletAddress.trim(),
        instructions: formState.instructions.trim(),
        buyRateKesPerUsdt,
        sellRateKesPerUsdt,
      });

      setDraftState(null);
      success('Merchant settlement config updated.');
      await refreshDashboard();
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'Could not save merchant config.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <LiquidityHeader criticalAlertCount={criticalLiquidityAlerts.length} />

      <LiquidityMetricsGrid liquidity={dashboard.liquidity} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <WalletAddressesPanel liquidity={dashboard.liquidity} />
          <FlowSummaryPanel liquidity={dashboard.liquidity} />
        </div>

        <div className="space-y-6">
          <WorkerStatusPanel liquidity={dashboard.liquidity} />
          <MerchantSettlementConfigForm
            dirty={dirty}
            fiatCurrency={dashboard.liquidity.merchantConfig.fiatCurrency}
            formState={formState}
            onChange={handleChange}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
