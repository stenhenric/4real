import { startTransition, useCallback, useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw, X } from 'lucide-react';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { MerchantPageFallback } from '../../components/merchant/MerchantPageFallback';
import { formatDateTime, formatMoney } from '../../features/merchant/format';
import {
  getMerchantDeposits,
  reconcileMerchantDeposit,
  replayMerchantDeposits,
} from '../../services/merchant-dashboard.service';
import type {
  MerchantDepositReplayResultDTO,
  MerchantDepositReviewItemDTO,
} from '../../types/api';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';

type DepositStatusFilter = 'open' | 'resolved';

function toLocalDateTimeValue(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return copy.toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export default function DepositsPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { error: showError, success } = useToast();
  const [statusFilter, setStatusFilter] = useState<DepositStatusFilter>('open');
  const [deposits, setDeposits] = useState<MerchantDepositReviewItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<string | null>(null);
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [replayResult, setReplayResult] = useState<MerchantDepositReplayResultDTO | null>(null);
  const [replayBusy, setReplayBusy] = useState<'dry-run' | 'apply' | null>(null);
  const [windowStart, setWindowStart] = useState(() => toLocalDateTimeValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [windowEnd, setWindowEnd] = useState(() => toLocalDateTimeValue(new Date()));

  const loadDeposits = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);

    try {
      const nextDeposits = await getMerchantDeposits({
        status: statusFilter,
        limit: 100,
        signal,
      });

      startTransition(() => {
        setDeposits(nextDeposits);
        setLoading(false);
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setLoading(false);
      showError(error instanceof Error ? error.message : 'Failed to load deposit reviews.');
    }
  }, [showError, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDeposits(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadDeposits]);

  if (!dashboard) {
    return (
      <MerchantPageFallback
        title="Deposits"
        description="Deposit replay, memo review, and manual reconciliation will appear after the shared merchant dashboard request succeeds."
      />
    );
  }

  const handleReconcile = async (deposit: MerchantDepositReviewItemDTO, action: 'credit' | 'dismiss') => {
    const userId = (userOverrides[deposit.txHash] ?? deposit.candidateUserId ?? '').trim();
    const note = notes[deposit.txHash]?.trim();

    if (action === 'credit' && userId.length === 0) {
      showError('Select or enter a user ID before crediting the deposit.');
      return;
    }

    setRowAction(deposit.txHash);

    try {
      const updated = await reconcileMerchantDeposit(deposit.txHash, {
        action,
        userId: action === 'credit' ? userId : undefined,
        note: note || undefined,
      });

      success(action === 'credit' ? 'Deposit credited.' : 'Deposit dismissed.');
      setDeposits((current) => {
        if (statusFilter === 'resolved') {
          const next = current.filter((item) => item.txHash !== deposit.txHash);
          return [updated, ...next];
        }

        return current.filter((item) => item.txHash !== deposit.txHash);
      });
      await refreshDashboard();
      if (statusFilter === 'resolved') {
        await loadDeposits();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to resolve deposit review.');
    } finally {
      setRowAction(null);
    }
  };

  const runReplay = async (mode: 'dry-run' | 'apply') => {
    if (!windowStart || !windowEnd) {
      showError('Choose both replay window timestamps.');
      return;
    }

    setReplayBusy(mode);

    try {
      const result = await replayMerchantDeposits({
        sinceUnixTime: fromLocalDateTimeValue(windowStart),
        untilUnixTime: fromLocalDateTimeValue(windowEnd),
        dryRun: mode === 'dry-run',
      });

      setReplayResult(result);
      success(mode === 'dry-run' ? 'Replay preview generated.' : 'Replay window applied.');
      await Promise.all([
        loadDeposits(),
        refreshDashboard(),
      ]);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to replay deposit window.');
    } finally {
      setReplayBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-bold italic tracking-tight">Deposit Reconciliation</h2>
          <p className="text-sm font-mono opacity-60">
            Open reviews {dashboard.liquidity.unresolvedDepositCount} • replay missed windows and manually resolve unmatched memo flows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['open', 'resolved'] as const).map((filter) => (
            <button
              key={filter}
              className={cn(
                'rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors',
                statusFilter === filter
                  ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                  : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5',
              )}
              onClick={() => setStatusFilter(filter)}
              type="button"
            >
              {filter === 'open' ? 'Open reviews' : 'Resolved'}
            </button>
          ))}
        </div>
      </div>

      <SketchyContainer className="bg-white">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-bold italic">Replay Window</h3>
            <p className="text-sm font-mono opacity-60">
              Scan a mainnet time window, preview decisions, then apply the replay with the same shared ingestion logic as the live poller.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SketchyButton disabled={replayBusy !== null} onClick={() => { void runReplay('dry-run'); }}>
              <span className="flex items-center gap-2">
                <RefreshCw size={16} className={cn(replayBusy === 'dry-run' && 'animate-spin')} />
                Preview
              </span>
            </SketchyButton>
            <SketchyButton disabled={replayBusy !== null} onClick={() => { void runReplay('apply'); }}>
              <span className="flex items-center gap-2">
                <Check size={16} />
                Apply Replay
              </span>
            </SketchyButton>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Start</p>
            <input
              className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
              onChange={(event) => setWindowStart(event.target.value)}
              type="datetime-local"
              value={windowStart}
            />
          </label>
          <label className="rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">End</p>
            <input
              className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
              onChange={(event) => setWindowEnd(event.target.value)}
              type="datetime-local"
              value={windowEnd}
            />
          </label>
        </div>

        {replayResult ? (
          <div className="mt-4 rounded-3xl border border-black/10 bg-black/5 px-4 py-4">
            <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
              <span>{replayResult.dryRun ? 'Dry run' : 'Applied'}</span>
              <span>{replayResult.transfers.length} transfer{replayResult.transfers.length === 1 ? '' : 's'}</span>
              <span>{formatDateTime(new Date(replayResult.sinceUnixTime * 1000).toISOString())}</span>
              <span>{formatDateTime(new Date(replayResult.untilUnixTime * 1000).toISOString())}</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                    <th className="px-3 py-3">Decision</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-3 py-3">Memo</th>
                    <th className="px-3 py-3">Candidate</th>
                    <th className="px-3 py-3">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {replayResult.transfers.map((transfer) => (
                    <tr key={transfer.txHash} className="border-b border-black/10 last:border-b-0">
                      <td className="px-3 py-3 font-bold">{transfer.decision}</td>
                      <td className="px-3 py-3">{formatMoney(transfer.amountUsdt)} USDT</td>
                      <td className="px-3 py-3 font-mono text-xs">{transfer.comment || 'empty'}</td>
                      <td className="px-3 py-3">
                        {transfer.candidateUsername ?? transfer.candidateUserId ?? 'None'}
                      </td>
                      <td className="px-3 py-3">{formatDateTime(transfer.txTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </SketchyContainer>

      <SketchyContainer className="bg-white p-0">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <h3 className="text-2xl font-bold italic">
              {statusFilter === 'open' ? 'Open Deposit Reviews' : 'Resolved Deposit Reviews'}
            </h3>
            <p className="text-sm font-mono opacity-60">
              Review memo mismatches, expired memos, and manual operator decisions.
            </p>
          </div>
          <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-bold uppercase">
            {deposits.length} item{deposits.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black/10 bg-black/5 text-left text-xs font-bold uppercase tracking-[0.2em] text-black/50">
                <th className="px-4 py-4">Deposit</th>
                <th className="px-4 py-4">Memo State</th>
                <th className="px-4 py-4">Candidate</th>
                <th className="px-4 py-4">Observed</th>
                <th className="px-4 py-4">Resolution</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={6}>
                    Loading deposit reviews...
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={6}>
                    No deposit reviews match the current filter.
                  </td>
                </tr>
              ) : (
                deposits.map((deposit) => (
                  <tr key={deposit.txHash} className="border-b border-black/10 align-top last:border-b-0">
                    <td className="px-4 py-4">
                      <p className="text-xl font-bold italic">{formatMoney(deposit.amountUsdt)} USDT</p>
                      <p className="mt-2 text-xs font-mono opacity-50">{deposit.txHash}</p>
                      <p className="mt-2 max-w-md text-sm font-mono opacity-70">
                        Memo: {deposit.comment || 'empty'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold uppercase text-yellow-800">
                        {deposit.memoStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono">
                      <div>{deposit.candidateUsername ?? 'No exact memo owner'}</div>
                      <div className="mt-1 opacity-60">{deposit.candidateUserId ?? 'None'}</div>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono">
                      <div>{formatDateTime(deposit.txTime)}</div>
                      <div className="mt-2 opacity-60">Recorded {formatDateTime(deposit.recordedAt)}</div>
                      {deposit.senderOwnerAddress ? (
                        <div className="mt-2 break-all opacity-60">Sender {deposit.senderOwnerAddress}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-sm font-mono">
                      {deposit.resolutionStatus === 'open' ? (
                        <div className="flex items-center gap-2 opacity-60">
                          <Clock3 size={14} />
                          Waiting for operator action
                        </div>
                      ) : (
                        <>
                          <div className="font-bold">{deposit.resolutionStatus}</div>
                          <div className="mt-1 opacity-60">{formatDateTime(deposit.resolvedAt)}</div>
                          {deposit.resolvedUserId ? (
                            <div className="mt-2 opacity-60">Credited to {deposit.resolvedUserId}</div>
                          ) : null}
                          {deposit.resolutionNote ? (
                            <div className="mt-2 opacity-60">{deposit.resolutionNote}</div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {deposit.resolutionStatus === 'open' ? (
                        <div className="flex flex-col items-end gap-3">
                          <input
                            className="w-72 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-mono"
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setUserOverrides((current) => ({
                                ...current,
                                [deposit.txHash]: nextValue,
                              }));
                            }}
                            placeholder={deposit.candidateUserId ?? 'Target user ID'}
                            type="text"
                            value={userOverrides[deposit.txHash] ?? ''}
                          />
                          <input
                            className="w-72 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-mono"
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setNotes((current) => ({
                                ...current,
                                [deposit.txHash]: nextValue,
                              }));
                            }}
                            placeholder="Operator note"
                            type="text"
                            value={notes[deposit.txHash] ?? ''}
                          />
                          <div className="flex gap-2">
                            <SketchyButton
                              className="px-3 py-2 text-sm text-ink-red"
                              disabled={rowAction === deposit.txHash}
                              onClick={() => {
                                void handleReconcile(deposit, 'dismiss');
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <X size={15} />
                                Dismiss
                              </span>
                            </SketchyButton>
                            <SketchyButton
                              className="px-3 py-2 text-sm text-green-700"
                              disabled={rowAction === deposit.txHash}
                              onClick={() => {
                                void handleReconcile(deposit, 'credit');
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <Check size={15} />
                                Credit
                              </span>
                            </SketchyButton>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-mono opacity-40">Final state</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SketchyContainer>
    </div>
  );
}
