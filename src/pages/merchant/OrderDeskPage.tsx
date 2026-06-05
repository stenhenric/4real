import { startTransition, useCallback, useEffect, useReducer, useRef } from 'react';
import { AlertTriangle, Check, ExternalLink, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge, statusToneFromStatus } from '../../components/ui/StatusBadge';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { formatDateTime, formatMoney, formatRelativeMinutes } from '../../features/merchant/format';
import { getMerchantOrders } from '../../services/merchant-dashboard.service';
import { updateOrderStatus } from '../../services/orders.service';
import type { MerchantOrderDeskItemDTO, MerchantOrderDeskResponseDTO, OrderDTO } from '../../types/api';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';
import { getApiErrorMessage } from '../../utils/errors';
import {
  createInitialOrderDeskState,
  orderDeskReducer,
  type OrderStatusFilter,
  type OrderTypeFilter,
} from './orderDeskReducer';

const ORDER_STATUS_FILTERS: OrderStatusFilter[] = ['PENDING', 'DONE', 'REJECTED', 'ALL'];
const ORDER_TYPE_FILTERS: OrderTypeFilter[] = ['ALL', 'BUY', 'SELL'];

function getRowActionKey(orderId: string) {
  return orderId;
}

type OrderStatusUpdateHandler = (orderId: string, nextStatus: OrderDTO['status']) => void;

function OrderDeskHeader({
  highRiskPendingOrderCount,
  onStatusFilterChange,
  onTypeFilterChange,
  pendingOrderCount,
  statusFilter,
  typeFilter,
}: {
  highRiskPendingOrderCount: number;
  onStatusFilterChange: (filter: OrderStatusFilter) => void;
  onTypeFilterChange: (filter: OrderTypeFilter) => void;
  pendingOrderCount: number;
  statusFilter: OrderStatusFilter;
  typeFilter: OrderTypeFilter;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-4xl font-semibold italic tracking-tight">Order Desk</h2>
        <p className="text-sm font-mono opacity-60">
          Pending queue {pendingOrderCount} • high risk {highRiskPendingOrderCount}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ORDER_TYPE_FILTERS.map((filter) => (
          <SketchyButton
            key={filter}
            className={cn(
              'border-2 px-4 py-2 text-sm font-bold transition-colors',
              typeFilter === filter
                ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5',
            )}
            fill={typeFilter === filter ? 'var(--color-info-bg)' : 'var(--color-surface)'}
            onClick={() => onTypeFilterChange(filter)}
            type="button"
          >
            {filter}
          </SketchyButton>
        ))}

        {ORDER_STATUS_FILTERS.map((filter) => (
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
            {filter}
          </SketchyButton>
        ))}
      </div>
    </div>
  );
}

function OrderProofDetails({ order }: { order: MerchantOrderDeskItemDTO }) {
  return (
    <div className="space-y-2">
      {order.proof?.url ? (
        <a
          className="inline-flex items-center gap-1 text-sm font-bold text-ink-blue hover:underline"
          href={order.proof.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open
          <ExternalLink size={14} />
        </a>
      ) : (
        <span className="text-sm font-mono opacity-40">No proof</span>
      )}
      {order.transactionCode ? (
        <p className="text-xs font-mono opacity-70">
          Code: <span className="font-bold text-ink-black">{order.transactionCode}</span>
        </p>
      ) : null}
    </div>
  );
}

function OrderActionButtons({
  disabled,
  onStatusUpdate,
  order,
}: {
  disabled: boolean;
  onStatusUpdate: OrderStatusUpdateHandler;
  order: MerchantOrderDeskItemDTO;
}) {
  if (order.status !== 'PENDING') {
    return <span className="text-xs font-mono opacity-40">Final state</span>;
  }

  return (
    <>
      <SketchyButton
        className="px-3 py-2 text-sm text-ink-red"
        disabled={disabled}
        onClick={() => {
          onStatusUpdate(order.id, 'REJECTED');
        }}
      >
        <span className="flex items-center gap-2">
          <X size={15} />
          Reject
        </span>
      </SketchyButton>
      <SketchyButton
        className="px-3 py-2 text-sm text-success-text"
        disabled={disabled}
        fill="var(--color-success-bg)"
        onClick={() => {
          onStatusUpdate(order.id, 'DONE');
        }}
      >
        <span className="flex items-center gap-2">
          <Check size={15} />
          Approve
        </span>
      </SketchyButton>
    </>
  );
}

function MobileOrderCards({
  loading,
  onStatusUpdate,
  orders,
  rowActions,
}: {
  loading: boolean;
  onStatusUpdate: OrderStatusUpdateHandler;
  orders: MerchantOrderDeskItemDTO[];
  rowActions: Record<string, true>;
}) {
  return (
    <div className="space-y-4 p-4 md:hidden">
      {loading ? (
        <EmptyState>Loading merchant queue…</EmptyState>
      ) : orders.length === 0 ? (
        <EmptyState>No orders match the current filters.</EmptyState>
      ) : (
        orders.map((order) => (
          <article key={order.id} className="rough-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={order.type === 'BUY' ? 'info' : 'danger'}>{order.type}</StatusBadge>
                  <StatusBadge tone={statusToneFromStatus(order.status)}>{order.status}</StatusBadge>
                </div>
                <p className="mt-3 text-2xl font-bold italic">{formatMoney(order.amount)} USDT</p>
                <p className="text-xs font-mono opacity-50">#{order.id.slice(0, 8)}</p>
              </div>
              <StatusBadge tone={statusToneFromStatus(order.riskLevel)}>
                {order.riskLevel === 'high' ? <ShieldAlert size={14} /> : order.riskLevel === 'medium' ? <AlertTriangle size={14} /> : null}
                {order.riskLevel}
              </StatusBadge>
            </div>

            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">User</dt>
                <dd>
                  <Link className="font-bold text-ink-blue hover:underline" to={`/profile/${order.user.id}`}>
                    {order.user.username}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Submitted</dt>
                <dd className="font-mono">{formatDateTime(order.createdAt)} • {formatRelativeMinutes(order.waitMinutes)}</dd>
              </div>
              {order.exchangeRate && order.fiatTotal && order.fiatCurrency ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Fiat quote</dt>
                  <dd className="font-mono">{formatMoney(order.fiatTotal)} {order.fiatCurrency} at {formatMoney(order.exchangeRate)} {order.fiatCurrency}/USDT</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Proof</dt>
                <dd className="space-y-1 font-mono">
                  {order.proof?.url ? (
                    <a className="inline-flex items-center gap-1 font-bold text-ink-blue hover:underline" href={order.proof.url} rel="noopener noreferrer" target="_blank">
                      Open proof <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="opacity-45">No proof</span>
                  )}
                  {order.transactionCode ? <p>Code: <span className="font-bold text-ink-black">{order.transactionCode}</span></p> : null}
                </dd>
              </div>
              {order.riskFlags.length > 0 ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-widest opacity-50">Risk flags</dt>
                  <dd className="font-mono opacity-70">{order.riskFlags.join(' • ')}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <OrderActionButtons
                disabled={Boolean(rowActions[getRowActionKey(order.id)])}
                onStatusUpdate={onStatusUpdate}
                order={order}
              />
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function DesktopOrderTable({
  loading,
  onStatusUpdate,
  orders,
  rowActions,
}: {
  loading: boolean;
  onStatusUpdate: OrderStatusUpdateHandler;
  orders: MerchantOrderDeskItemDTO[];
  rowActions: Record<string, true>;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black/10 bg-black/5 text-left text-xs font-bold uppercase tracking-[0.2em] text-black/50">
            <th className="p-4">Order</th>
            <th className="p-4">User</th>
            <th className="p-4">Submitted</th>
            <th className="p-4">Risk</th>
            <th className="p-4">Proof</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={7}>
                Loading merchant queue…
              </td>
            </tr>
          ) : orders.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={7}>
                No orders match the current filters.
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr key={order.id} className="border-b border-black/10 align-top last:border-b-0">
                <td className="p-4">
                  <div className="flex items-start gap-3">
                    <StatusBadge tone={order.type === 'BUY' ? 'info' : 'danger'}>
                      {order.type}
                    </StatusBadge>
                    <div>
                      <p className="text-xl font-bold italic">{formatMoney(order.amount)} USDT</p>
                      <p className="text-xs font-mono opacity-50">#{order.id.slice(0, 8)}</p>
                      {order.exchangeRate && order.fiatTotal && order.fiatCurrency ? (
                        <p className="mt-2 text-sm font-mono opacity-70">
                          {formatMoney(order.fiatTotal)} {order.fiatCurrency} at {formatMoney(order.exchangeRate)} {order.fiatCurrency}/USDT
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <Link className="font-bold text-ink-blue hover:underline" to={`/profile/${order.user.id}`}>
                    {order.user.username}
                  </Link>
                </td>
                <td className="p-4 text-sm font-mono">
                  <div>{formatDateTime(order.createdAt)}</div>
                  <div className="mt-1 opacity-60">{formatRelativeMinutes(order.waitMinutes)}</div>
                </td>
                <td className="p-4">
                  <StatusBadge tone={statusToneFromStatus(order.riskLevel)}>
                    {order.riskLevel === 'high' ? <ShieldAlert size={14} /> : order.riskLevel === 'medium' ? <AlertTriangle size={14} /> : null}
                    {order.riskLevel}
                  </StatusBadge>
                  {order.riskFlags.length > 0 ? (
                    <p className="mt-2 max-w-xs text-sm font-mono opacity-70">{order.riskFlags.join(' • ')}</p>
                  ) : null}
                </td>
                <td className="p-4">
                  <OrderProofDetails order={order} />
                </td>
                <td className="p-4">
                  <StatusBadge tone={statusToneFromStatus(order.status)}>
                    {order.status}
                  </StatusBadge>
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <OrderActionButtons
                      disabled={Boolean(rowActions[getRowActionKey(order.id)])}
                      onStatusUpdate={onStatusUpdate}
                      order={order}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function OrderPagination({
  deskData,
  onPageChange,
  page,
}: {
  deskData: MerchantOrderDeskResponseDTO | null;
  onPageChange: (nextPage: number) => void;
  page: number;
}) {
  if (!deskData) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border border-black/10 bg-white/80 p-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm font-mono opacity-60">
        Showing page {deskData.pagination.page} of {deskData.pagination.totalPages} • {deskData.pagination.total} total orders
      </p>
      <div className="flex items-center gap-2">
        <SketchyButton
          className="border-2 border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40"
          disabled={deskData.pagination.page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          Previous
        </SketchyButton>
        <SketchyButton
          className="border-2 border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40"
          disabled={deskData.pagination.page >= deskData.pagination.totalPages}
          onClick={() => onPageChange(Math.min(deskData.pagination.totalPages, page + 1))}
          type="button"
        >
          Next
        </SketchyButton>
      </div>
    </div>
  );
}

export default function OrderDeskPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { error: showError, success } = useToast();
  const [deskState, dispatchDesk] = useReducer(
    orderDeskReducer,
    undefined,
    createInitialOrderDeskState,
  );
  const {
    typeFilter,
    statusFilter,
    page,
    deskData,
    loading,
    rowActions,
  } = deskState;
  const ordersRequestRef = useRef(0);
  const ordersQueryRef = useRef({
    page,
    status: statusFilter,
    type: typeFilter,
  });

  ordersQueryRef.current = {
    page,
    status: statusFilter,
    type: typeFilter,
  };

  const loadOrders = useCallback(async (
    signal?: AbortSignal,
    requestedQuery = ordersQueryRef.current,
  ) => {
    const requestId = ordersRequestRef.current + 1;
    ordersRequestRef.current = requestId;
    dispatchDesk({ type: 'LOAD_STARTED' });

    try {
      const nextData = await getMerchantOrders({
        page: requestedQuery.page,
        pageSize: 25,
        status: requestedQuery.status,
        type: requestedQuery.type,
        ...(signal ? { signal } : {}),
      });

      const currentQuery = ordersQueryRef.current;
      if (
        signal?.aborted
        || ordersRequestRef.current !== requestId
        || currentQuery.page !== requestedQuery.page
        || currentQuery.status !== requestedQuery.status
        || currentQuery.type !== requestedQuery.type
      ) {
        return;
      }

      startTransition(() => {
        dispatchDesk({ type: 'LOAD_SUCCEEDED', deskData: nextData });
      });
    } catch (error) {
      if (isAbortError(error, signal, { pageUnloading: document.visibilityState === 'hidden' })) {
        return;
      }

      if (ordersRequestRef.current !== requestId) {
        return;
      }

      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        dispatchDesk({ type: 'LOAD_FAILED' });
        return;
      }

      dispatchDesk({ type: 'LOAD_FAILED' });
      showError(getApiErrorMessage(error, 'Could not load merchant orders.'));
    }
  }, [showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadOrders]);

  const handleStatusUpdate = async (orderId: string, nextStatus: OrderDTO['status']) => {
    const rowActionKey = getRowActionKey(orderId);
    dispatchDesk({ type: 'ROW_ACTION_STARTED', rowActionKey });

    try {
      await updateOrderStatus(orderId, nextStatus);
      success(`Order marked ${nextStatus.toLowerCase()}.`);
      await Promise.all([
        loadOrders(),
        refreshDashboard(),
      ]);
    } catch (error) {
      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        return;
      }

      showError(getApiErrorMessage(error, 'Could not update that order.'));
    } finally {
      dispatchDesk({ type: 'ROW_ACTION_FINISHED', rowActionKey });
    }
  };

  const requestOrdersForQuery = (query: typeof ordersQueryRef.current) => {
    ordersQueryRef.current = query;
    void loadOrders(undefined, query);
  };

  const handleTypeFilterChange = (filter: OrderTypeFilter) => {
    const nextQuery = { page: 1, status: statusFilter, type: filter };
    dispatchDesk({ type: 'TYPE_FILTER_CHANGED', typeFilter: filter });
    requestOrdersForQuery(nextQuery);
  };

  const handleStatusFilterChange = (filter: OrderStatusFilter) => {
    const nextQuery = { page: 1, status: filter, type: typeFilter };
    dispatchDesk({ type: 'STATUS_FILTER_CHANGED', statusFilter: filter });
    requestOrdersForQuery(nextQuery);
  };

  const handlePageChange = (nextPage: number) => {
    const boundedPage = Math.max(1, nextPage);
    const nextQuery = { page: boundedPage, status: statusFilter, type: typeFilter };
    dispatchDesk({ type: 'PAGE_CHANGED', page: boundedPage });
    requestOrdersForQuery(nextQuery);
  };

  const orders = deskData?.orders ?? [];

  return (
    <div className="space-y-6">
      <OrderDeskHeader
        highRiskPendingOrderCount={dashboard?.overview.highRiskPendingOrderCount ?? 0}
        onStatusFilterChange={handleStatusFilterChange}
        onTypeFilterChange={handleTypeFilterChange}
        pendingOrderCount={dashboard?.overview.pendingOrderCount ?? 0}
        statusFilter={statusFilter}
        typeFilter={typeFilter}
      />

      <SketchyContainer className="bg-white p-0">
        <MobileOrderCards
          loading={loading}
          onStatusUpdate={(orderId, nextStatus) => {
            void handleStatusUpdate(orderId, nextStatus);
          }}
          orders={orders}
          rowActions={rowActions}
        />

        <DesktopOrderTable
          loading={loading}
          onStatusUpdate={(orderId, nextStatus) => {
            void handleStatusUpdate(orderId, nextStatus);
          }}
          orders={orders}
          rowActions={rowActions}
        />
      </SketchyContainer>

      <OrderPagination
        deskData={deskData}
        onPageChange={handlePageChange}
        page={page}
      />
    </div>
  );
}
