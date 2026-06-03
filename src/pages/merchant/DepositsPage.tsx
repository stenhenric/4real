import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock3, RefreshCw, X } from 'lucide-react';
import { ApiClientError } from '../../services/api/apiClient';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { MerchantPageFallback } from '../../components/merchant/MerchantPageFallback';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { formatDateTime, formatMoney } from '../../features/merchant/format';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
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
import { getApiErrorMessage } from '../../utils/errors';

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
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const depositsRequestRef = useRef(0);
  const depositsFilterRef = useRef(statusFilter);

  depositsFilterRef.current = statusFilter;

  const loadDeposits = useCallback(async (
    signal?: AbortSignal,
    requestedStatus: DepositStatusFilter = depositsFilterRef.current,
  ) => {
    const requestId = depositsRequestRef.current + 1;
    depositsRequestRef.current = requestId;
    setLoading(true);

    try {
      const nextDeposits = await getMerchantDeposits({
        status: requestedStatus,
        limit: 100,
        ...(signal ? { signal } : {}),
      });

      if (
        signal?.aborted
        || depositsRequestRef.current !== requestId
        || depositsFilterRef.current !== requestedStatus
      ) {
        return;
      }

      startTransition(() => {
        setDeposits(nextDeposits);
        setLoading(false);
      });
    } catch (error) {
      if (isAbortError(error, signal, { pageUnloading: document.visibilityState === 'hidden' })) {
        return;
      }

      if (depositsRequestRef.current !== requestId) {
        return;
      }

      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        setLoading(false);
        return;
      }

      setLoading(false);
      showError(getApiErrorMessage(error, 'Could not load deposit reviews.'));
    }
  }, [showError]);

  useEffect(() => {
    setWindowStart(toLocalDateTimeValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    setWindowEnd(toLocalDateTimeValue(new Date()));
  }, []);

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
      showError('Select a user before crediting deposit.');
      return;
    }

    setRowAction(deposit.txHash);

    try {
      const updated = await reconcileMerchantDeposit(deposit.txHash, {
        action,
        ...(action === 'credit' ? { userId } : {}),
        ...(note ? { note } : {}),
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
        await loadDeposits(undefined, depositsFilterRef.current);
      }
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'Could not resolve that deposit review.'));
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
      const requestedStatus = depositsFilterRef.current;
      await Promise.all([
        loadDeposits(undefined, requestedStatus),
        refreshDashboard(),
      ]);
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'Could not execute the deposit replay.'));
    } finally {
      setReplayBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-semibold italic tracking-tight">Deposit Reconciliation</h2>
          <p className="text-sm font-mono opacity-60">
            Open reviews {dashboard.liquidity.unresolvedDepositCount} • replay missed windows and manually resolve unmatched memo flows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['open', 'resolved'] as const).map((filter) => (
            <SketchyButton
              key={filter}
              className={cn(
                'border-2 px-4 py-2 text-sm font-bold transition-colors',
                statusFilter === filter
                  ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                  : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5',
              )}
              fill={statusFilter === filter ? 'var(--color-info-bg)' : 'var(--color-surface)'}
              onClick={() => setStatusFilter(filter)}
              type="button"
            >
              {filter === 'open' ? 'Open reviews' : 'Resolved'}
            </SketchyButton>
          ))}
        </div>
      </div>

      <SketchyContainer className="bg-white">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-semibold italic">Replay Window</h3>
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
          <label className="border border-black/10 bg-black/5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">Start</p>
            <input
              className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
              onChange={(event) => setWindowStart(event.target.value)}
              type="datetime-local"
              value={windowStart}
            />
          </label>
          <label className="border border-black/10 bg-black/5 p-4">
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
          <div className="mt-4 border border-black/10 bg-black/5 p-4">
            <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
              <span>{replayResult.dryRun ? 'Dry run' : 'Applied'}</span>
              <span>{replayResult.transfers.length} transfer{replayResult.transfers.length === 1 ? '' : 's'}</span>
              <span>{formatDateTime(replayResult.sinceUnixTime * 1000)}</span>
              <span>{formatDateTime(replayResult.untilUnixTime * 1000)}</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                    <th className="p-3">Decision</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Memo</th>
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {replayResult.transfers.map((transfer) => (
                    <tr key={transfer.txHash} className="border-b border-black/10 last:border-b-0">
                      <td className="p-3 font-bold">{transfer.decision}</td>
                      <td className="p-3">{formatMoney(transfer.amountUsdt)} USDT</td>
                      <td className="p-3 font-mono text-xs">{transfer.comment || 'empty'}</td>
                      <td className="p-3">
                        {transfer.candidateUsername ?? transfer.candidateUserId ?? 'None'}
                      </td>
                      <td className="p-3">{formatDateTime(transfer.txTime)}</td>
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
            <h3 className="text-2xl font-semibold italic">
              {statusFilter === 'open' ? 'Open Deposit Reviews' : 'Resolved Deposit Reviews'}
            </h3>
            <p className="text-sm font-mono opacity-60">
              Review memo mismatches, expired memos, and manual operator decisions.
            </p>
          </div>
          <span className="border border-black/10 bg-black/5 px-3 py-1 text-xs font-bold uppercase">
            {deposits.length} item{deposits.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {loading ? (
            <EmptyState>Loading deposit reviews…</EmptyState>
          ) : deposits.length === 0 ? (
            <EmptyState>No deposit reviews match the current filter.</EmptyState>
          ) : (
            deposits.map((deposit) => {
              const userInputId = `deposit-user-${deposit.txHash}`;
              const noteInputId = `deposit-note-${deposit.txHash}`;

              return (
                <article key={deposit.txHash} className="rough-border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold italic">{formatMoney(deposit.amountUsdt)} USDT</p>
                      <p className="mt-2 break-all text-xs font-mono opacity-50">{deposit.txHash}</p>
                    </div>
                    <StatusBadge tone={statusToneFromStatus(deposit.memoStatus)}>{deposit.memoStatus}</StatusBadge>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Memo</dt>
                      <dd className="break-all font-mono opacity-70">{deposit.comment || 'empty'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Candidate</dt>
                      <dd className="font-mono">
                        {deposit.candidateUsername ?? 'No exact memo owner'}
                        <span className="block opacity-60">{deposit.candidateUserId ?? 'None'}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Observed</dt>
                      <dd className="font-mono">{formatDateTime(deposit.txTime)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Resolution</dt>
                      <dd className="font-mono">
                        {deposit.resolutionStatus === 'open' ? 'Waiting for operator action' : deposit.resolutionStatus}
                      </dd>
                    </div>
                  </dl>

                  {deposit.resolutionStatus === 'open' ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-55" htmlFor={userInputId}>
                          Target user ID
                        </label>
                        <input
                          className="w-full border-b-4 border-black/20 bg-white px-3 py-2 text-sm font-mono"
                          id={userInputId}
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
                      </div>
                      <div>
                        <label className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-55" htmlFor={noteInputId}>
                          Operator note
                        </label>
                        <input
                          className="w-full border-b-4 border-black/20 bg-white px-3 py-2 text-sm font-mono"
                          id={noteInputId}
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
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <SketchyButton
                          className="px-3 py-2 text-sm text-danger-text"
                          disabled={rowAction === deposit.txHash}
                          fill="var(--color-danger-bg)"
                          onClick={() => {
                            void handleReconcile(deposit, 'dismiss');
                          }}
                        >
                          <X size={15} />
                          Dismiss
                        </SketchyButton>
                        <SketchyButton
                          className="px-3 py-2 text-sm text-success-text"
                          disabled={rowAction === deposit.txHash}
                          fill="var(--color-success-bg)"
                          onClick={() => {
                            void handleReconcile(deposit, 'credit');
                          }}
                        >
                          <Check size={15} />
                          Credit
                        </SketchyButton>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs font-mono opacity-40">Final state</p>
                  )}
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black/10 bg-black/5 text-left text-xs font-bold uppercase tracking-[0.2em] text-black/50">
                <th className="p-4">Deposit</th>
                <th className="p-4">Memo State</th>
                <th className="p-4">Candidate</th>
                <th className="p-4">Observed</th>
                <th className="p-4">Resolution</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={6}>
                    Loading deposit reviews…
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
                    <td className="p-4">
                      <p className="text-xl font-bold italic">{formatMoney(deposit.amountUsdt)} USDT</p>
                      <p className="mt-2 text-xs font-mono opacity-50">{deposit.txHash}</p>
                      <p className="mt-2 max-w-md text-sm font-mono opacity-70">
                        Memo: {deposit.comment || 'empty'}
                      </p>
                    </td>
                    <td className="p-4">
                      <StatusBadge tone={statusToneFromStatus(deposit.memoStatus)}>
                        {deposit.memoStatus}
                      </StatusBadge>
                    </td>
                    <td className="p-4 text-sm font-mono">
                      <div>{deposit.candidateUsername ?? 'No exact memo owner'}</div>
                      <div className="mt-1 opacity-60">{deposit.candidateUserId ?? 'None'}</div>
                    </td>
                    <td className="p-4 text-sm font-mono">
                      <div>{formatDateTime(deposit.txTime)}</div>
                      <div className="mt-2 opacity-60">Recorded {formatDateTime(deposit.recordedAt)}</div>
                      {deposit.senderOwnerAddress ? (
                        <div className="mt-2 break-all opacity-60">Sender {deposit.senderOwnerAddress}</div>
                      ) : null}
                    </td>
                    <td className="p-4 text-sm font-mono">
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
                    <td className="p-4">
                      {deposit.resolutionStatus === 'open' ? (
                        <div className="flex flex-col items-end gap-3">
                          <input
                            aria-label={`Target user ID for deposit ${deposit.txHash}`}
                            className="w-72 border border-black/10 bg-white px-4 py-2 text-sm font-mono"
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
                            aria-label={`Operator note for deposit ${deposit.txHash}`}
                            className="w-72 border border-black/10 bg-white px-4 py-2 text-sm font-mono"
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
                              className="px-3 py-2 text-sm text-success-text"
                              disabled={rowAction === deposit.txHash}
                              fill="var(--color-success-bg)"
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
