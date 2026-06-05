import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import type { MerchantDepositReplayResultDTO, MerchantDepositReviewItemDTO } from '../../types/api';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import { getApiErrorMessage } from '../../utils/errors';
import { formatWalletAddressForDisplay } from '../../features/bank/walletAddressPresentation';
import {
  createInitialDepositsState,
  depositsReducer,
  type DepositStatusFilter,
  type ReplayMode,
} from './depositsReducer';

const DEPOSIT_STATUS_FILTERS = ['open', 'resolved'] as const;

type DepositReconcileAction = 'credit' | 'dismiss';
type DepositReconcileHandler = (deposit: MerchantDepositReviewItemDTO, action: DepositReconcileAction) => void;

function toLocalDateTimeValue(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return copy.toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

function DepositsHeader({
  onStatusFilterChange,
  statusFilter,
  unresolvedDepositCount,
}: {
  onStatusFilterChange: (filter: DepositStatusFilter) => void;
  statusFilter: DepositStatusFilter;
  unresolvedDepositCount: number;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-4xl font-semibold italic tracking-tight">Deposit Reconciliation</h2>
        <p className="text-sm font-mono opacity-60">
          Open reviews {unresolvedDepositCount} • replay missed windows and manually resolve unmatched memo flows.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {DEPOSIT_STATUS_FILTERS.map((filter) => (
          <SketchyButton
            key={filter}
            className={cn(
              'border-2 px-4 py-2 text-sm font-bold transition-colors',
              statusFilter === filter
                ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5',
            )}
            fill={statusFilter === filter ? 'var(--color-info-bg)' : 'var(--color-surface)'}
            onClick={() => onStatusFilterChange(filter)}
            type="button"
          >
            {filter === 'open' ? 'Open reviews' : 'Resolved'}
          </SketchyButton>
        ))}
      </div>
    </div>
  );
}

function ReplayWindowPanel({
  onReplay,
  onWindowChange,
  replayBusy,
  replayResult,
  windowEnd,
  windowStart,
}: {
  onReplay: (mode: ReplayMode) => void;
  onWindowChange: (field: 'windowStart' | 'windowEnd', value: string) => void;
  replayBusy: ReplayMode | null;
  replayResult: MerchantDepositReplayResultDTO | null;
  windowEnd: string;
  windowStart: string;
}) {
  return (
    <SketchyContainer className="bg-white">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold italic">Replay Window</h3>
          <p className="text-sm font-mono opacity-60">
            Scan a mainnet time window, preview decisions, then apply the replay with the same shared ingestion logic as the live poller.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SketchyButton disabled={replayBusy !== null} onClick={() => onReplay('dry-run')}>
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className={cn(replayBusy === 'dry-run' && 'animate-spin')} />
              Preview
            </span>
          </SketchyButton>
          <SketchyButton disabled={replayBusy !== null} onClick={() => onReplay('apply')}>
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
            onChange={(event) => onWindowChange('windowStart', event.target.value)}
            type="datetime-local"
            value={windowStart}
          />
        </label>
        <label className="border border-black/10 bg-black/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-50">End</p>
          <input
            className="mt-2 w-full bg-transparent text-sm font-mono focus:outline-none"
            onChange={(event) => onWindowChange('windowEnd', event.target.value)}
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
  );
}

function DepositReviewActions({
  deposit,
  onReconcile,
  rowAction,
}: {
  deposit: MerchantDepositReviewItemDTO;
  onReconcile: DepositReconcileHandler;
  rowAction: string | null;
}) {
  if (deposit.resolutionStatus !== 'open') {
    return <span className="text-xs font-mono opacity-40">Final state</span>;
  }

  return (
    <>
      <SketchyButton
        className="px-3 py-2 text-sm text-ink-red"
        disabled={rowAction === deposit.txHash}
        onClick={() => onReconcile(deposit, 'dismiss')}
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
        onClick={() => onReconcile(deposit, 'credit')}
      >
        <span className="flex items-center gap-2">
          <Check size={15} />
          Credit
        </span>
      </SketchyButton>
    </>
  );
}

function DepositReviewInputs({
  deposit,
  note,
  onNoteChange,
  onUserOverrideChange,
  userOverride,
}: {
  deposit: MerchantDepositReviewItemDTO;
  note: string;
  onNoteChange: (txHash: string, value: string) => void;
  onUserOverrideChange: (txHash: string, value: string) => void;
  userOverride: string;
}) {
  return (
    <>
      <input
        aria-label={`Target user ID for deposit ${deposit.txHash}`}
        className="w-72 border border-black/10 bg-white px-4 py-2 text-sm font-mono"
        onChange={(event) => onUserOverrideChange(deposit.txHash, event.target.value)}
        placeholder={deposit.candidateUserId ?? 'Target user ID'}
        type="text"
        value={userOverride}
      />
      <input
        aria-label={`Operator note for deposit ${deposit.txHash}`}
        className="w-72 border border-black/10 bg-white px-4 py-2 text-sm font-mono"
        onChange={(event) => onNoteChange(deposit.txHash, event.target.value)}
        placeholder="Operator note"
        type="text"
        value={note}
      />
    </>
  );
}

function MobileDepositReviews({
  deposits,
  loading,
  notes,
  onNoteChange,
  onReconcile,
  onUserOverrideChange,
  rowAction,
  userOverrides,
}: {
  deposits: MerchantDepositReviewItemDTO[];
  loading: boolean;
  notes: Record<string, string>;
  onNoteChange: (txHash: string, value: string) => void;
  onReconcile: DepositReconcileHandler;
  onUserOverrideChange: (txHash: string, value: string) => void;
  rowAction: string | null;
  userOverrides: Record<string, string>;
}) {
  return (
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
                      onChange={(event) => onUserOverrideChange(deposit.txHash, event.target.value)}
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
                      onChange={(event) => onNoteChange(deposit.txHash, event.target.value)}
                      placeholder="Operator note"
                      type="text"
                      value={notes[deposit.txHash] ?? ''}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <DepositReviewActions
                      deposit={deposit}
                      onReconcile={onReconcile}
                      rowAction={rowAction}
                    />
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
  );
}

function DesktopDepositReviews({
  deposits,
  loading,
  notes,
  onNoteChange,
  onReconcile,
  onUserOverrideChange,
  rowAction,
  userOverrides,
}: {
  deposits: MerchantDepositReviewItemDTO[];
  loading: boolean;
  notes: Record<string, string>;
  onNoteChange: (txHash: string, value: string) => void;
  onReconcile: DepositReconcileHandler;
  onUserOverrideChange: (txHash: string, value: string) => void;
  rowAction: string | null;
  userOverrides: Record<string, string>;
}) {
  return (
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
                    <div className="mt-2 break-all opacity-60" title={formatWalletAddressForDisplay(deposit.senderOwnerAddress)}>
                      Sender {formatWalletAddressForDisplay(deposit.senderOwnerAddress)}
                    </div>
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
                      <DepositReviewInputs
                        deposit={deposit}
                        note={notes[deposit.txHash] ?? ''}
                        onNoteChange={onNoteChange}
                        onUserOverrideChange={onUserOverrideChange}
                        userOverride={userOverrides[deposit.txHash] ?? ''}
                      />
                      <div className="flex gap-2">
                        <DepositReviewActions
                          deposit={deposit}
                          onReconcile={onReconcile}
                          rowAction={rowAction}
                        />
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
  );
}

function DepositReviewsPanel({
  deposits,
  loading,
  notes,
  onNoteChange,
  onReconcile,
  onUserOverrideChange,
  rowAction,
  statusFilter,
  userOverrides,
}: {
  deposits: MerchantDepositReviewItemDTO[];
  loading: boolean;
  notes: Record<string, string>;
  onNoteChange: (txHash: string, value: string) => void;
  onReconcile: DepositReconcileHandler;
  onUserOverrideChange: (txHash: string, value: string) => void;
  rowAction: string | null;
  statusFilter: DepositStatusFilter;
  userOverrides: Record<string, string>;
}) {
  return (
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

      <MobileDepositReviews
        deposits={deposits}
        loading={loading}
        notes={notes}
        onNoteChange={onNoteChange}
        onReconcile={onReconcile}
        onUserOverrideChange={onUserOverrideChange}
        rowAction={rowAction}
        userOverrides={userOverrides}
      />

      <DesktopDepositReviews
        deposits={deposits}
        loading={loading}
        notes={notes}
        onNoteChange={onNoteChange}
        onReconcile={onReconcile}
        onUserOverrideChange={onUserOverrideChange}
        rowAction={rowAction}
        userOverrides={userOverrides}
      />
    </SketchyContainer>
  );
}

export default function DepositsPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { error: showError, success } = useToast();
  const [depositState, dispatchDeposits] = useReducer(
    depositsReducer,
    undefined,
    () => createInitialDepositsState(
      toLocalDateTimeValue(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      toLocalDateTimeValue(new Date()),
    ),
  );
  const {
    statusFilter,
    deposits,
    loading,
    rowAction,
    replayResult,
    replayBusy,
    windowStart,
    windowEnd,
  } = depositState;
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const depositsRequestRef = useRef(0);
  const depositsFilterRef = useRef(statusFilter);

  depositsFilterRef.current = statusFilter;

  const loadDeposits = useCallback(async (
    signal?: AbortSignal,
    requestedStatus: DepositStatusFilter = depositsFilterRef.current,
  ) => {
    const requestId = depositsRequestRef.current + 1;
    depositsRequestRef.current = requestId;
    dispatchDeposits({ type: 'LOAD_STARTED' });

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
        dispatchDeposits({ type: 'LOAD_SUCCEEDED', deposits: nextDeposits });
      });
    } catch (error) {
      if (isAbortError(error, signal, { pageUnloading: document.visibilityState === 'hidden' })) {
        return;
      }

      if (depositsRequestRef.current !== requestId) {
        return;
      }

      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchDeposits({ type: 'LOAD_FAILED' });
        return;
      }

      dispatchDeposits({ type: 'LOAD_FAILED' });
      showError(getApiErrorMessage(error, 'Could not load deposit reviews.'));
    }
  }, [showError]);

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

    dispatchDeposits({ type: 'ROW_ACTION_STARTED', rowAction: deposit.txHash });

    try {
      const updated = await reconcileMerchantDeposit(deposit.txHash, {
        action,
        ...(action === 'credit' ? { userId } : {}),
        ...(note ? { note } : {}),
      });

      success(action === 'credit' ? 'Deposit credited.' : 'Deposit dismissed.');
      const nextDeposits = statusFilter === 'resolved'
        ? [updated, ...deposits.filter((item) => item.txHash !== deposit.txHash)]
        : deposits.filter((item) => item.txHash !== deposit.txHash);
      dispatchDeposits({ type: 'LOAD_SUCCEEDED', deposits: nextDeposits });
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
      dispatchDeposits({ type: 'ROW_ACTION_FINISHED' });
    }
  };

  const runReplay = async (mode: 'dry-run' | 'apply') => {
    if (!windowStart || !windowEnd) {
      showError('Choose both replay window timestamps.');
      return;
    }

    dispatchDeposits({ type: 'REPLAY_STARTED', mode });

    try {
      const result = await replayMerchantDeposits({
        sinceUnixTime: fromLocalDateTimeValue(windowStart),
        untilUnixTime: fromLocalDateTimeValue(windowEnd),
        dryRun: mode === 'dry-run',
      });

      dispatchDeposits({ type: 'REPLAY_SUCCEEDED', result });
      success(mode === 'dry-run' ? 'Replay preview generated.' : 'Replay window applied.');
      const requestedStatus = depositsFilterRef.current;
      await Promise.all([
        loadDeposits(undefined, requestedStatus),
        refreshDashboard(),
      ]);
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchDeposits({ type: 'REPLAY_FAILED' });
        return;
      }

      dispatchDeposits({ type: 'REPLAY_FAILED' });
      showError(getApiErrorMessage(error, 'Could not execute the deposit replay.'));
    }
  };

  const handleStatusFilterChange = (filter: DepositStatusFilter) => {
    depositsFilterRef.current = filter;
    dispatchDeposits({ type: 'FILTER_CHANGED', statusFilter: filter });
    void loadDeposits(undefined, filter);
  };

  return (
    <div className="space-y-6">
      <DepositsHeader
        onStatusFilterChange={handleStatusFilterChange}
        statusFilter={statusFilter}
        unresolvedDepositCount={dashboard.liquidity.unresolvedDepositCount}
      />

      <ReplayWindowPanel
        onReplay={(mode) => {
          void runReplay(mode);
        }}
        onWindowChange={(field, value) => dispatchDeposits({
          type: 'REPLAY_WINDOW_CHANGED',
          field,
          value,
        })}
        replayBusy={replayBusy}
        replayResult={replayResult}
        windowEnd={windowEnd}
        windowStart={windowStart}
      />

      <DepositReviewsPanel
        deposits={deposits}
        loading={loading}
        notes={notes}
        onNoteChange={(txHash, value) => setNotes((current) => ({
          ...current,
          [txHash]: value,
        }))}
        onReconcile={(deposit, action) => {
          void handleReconcile(deposit, action);
        }}
        onUserOverrideChange={(txHash, value) => setUserOverrides((current) => ({
          ...current,
          [txHash]: value,
        }))}
        rowAction={rowAction}
        statusFilter={statusFilter}
        userOverrides={userOverrides}
      />
    </div>
  );
}
