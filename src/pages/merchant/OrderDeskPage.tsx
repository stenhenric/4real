import { startTransition, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../services/api/apiClient';
import { useToast } from '../../app/ToastProvider';
import { SketchyButton } from '../../components/SketchyButton';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { isHandledAuthRedirectCode } from '../../features/auth/auth-routing';
import { formatDateTime, formatMoney, formatRelativeMinutes } from '../../features/merchant/format';
import { getMerchantOrders } from '../../services/merchant-dashboard.service';
import { updateOrderStatus } from '../../services/orders.service';
import type { MerchantOrderDeskResponseDTO, OrderDTO } from '../../types/api';
import { isAbortError } from '../../utils/isAbortError';
import { cn } from '../../utils/cn';

type OrderTypeFilter = 'ALL' | 'BUY' | 'SELL';
type OrderStatusFilter = 'ALL' | OrderDTO['status'];

const ORDER_STATUS_FILTERS: OrderStatusFilter[] = ['PENDING', 'DONE', 'REJECTED', 'ALL'];
const ORDER_TYPE_FILTERS: OrderTypeFilter[] = ['ALL', 'BUY', 'SELL'];

export default function OrderDeskPage() {
  const { dashboard, refreshDashboard } = useMerchantOutletContext();
  const { error: showError, success } = useToast();
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('PENDING');
  const [page, setPage] = useState(1);
  const [deskData, setDeskData] = useState<MerchantOrderDeskResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<string | null>(null);

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);

    try {
      const nextData = await getMerchantOrders({
        page,
        pageSize: 25,
        status: statusFilter,
        type: typeFilter,
        ...(signal ? { signal } : {}),
      });

      startTransition(() => {
        setDeskData(nextData);
        setLoading(false);
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (error instanceof ApiClientError && isHandledAuthRedirectCode(error.code)) {
        setLoading(false);
        return;
      }

      setLoading(false);
      showError(error instanceof Error ? error.message : 'Failed to load merchant orders.');
    }
  }, [page, showError, statusFilter, typeFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadOrders]);

  const handleStatusUpdate = async (orderId: string, nextStatus: OrderDTO['status']) => {
    setRowAction(orderId);

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

      showError(error instanceof Error ? error.message : 'Failed to update order.');
    } finally {
      setRowAction(null);
    }
  };

  const orders = deskData?.orders ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-bold italic tracking-tight">Order Desk</h2>
          <p className="text-sm font-mono opacity-60">
            Pending queue {dashboard?.overview.pendingOrderCount ?? 0} • high risk {dashboard?.overview.highRiskPendingOrderCount ?? 0}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ORDER_TYPE_FILTERS.map((filter) => (
            <button
              key={filter}
              className={cn(
                'rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors',
                typeFilter === filter
                  ? 'border-ink-blue bg-ink-blue/10 text-ink-blue'
                  : 'border-black/10 bg-white text-ink-black/70 hover:bg-black/5',
              )}
              onClick={() => {
                setPage(1);
                setTypeFilter(filter);
              }}
              type="button"
            >
              {filter}
            </button>
          ))}

          <select
            className="rounded-full border-2 border-black/10 bg-white px-4 py-2 text-sm font-bold"
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value as OrderStatusFilter);
            }}
            value={statusFilter}
          >
            {ORDER_STATUS_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SketchyContainer className="bg-white p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black/10 bg-black/5 text-left text-xs font-bold uppercase tracking-[0.2em] text-black/50">
                <th className="px-4 py-4">Order</th>
                <th className="px-4 py-4">User</th>
                <th className="px-4 py-4">Submitted</th>
                <th className="px-4 py-4">Risk</th>
                <th className="px-4 py-4">Proof</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm font-mono opacity-50" colSpan={7}>
                    Loading merchant queue...
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
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${order.type === 'BUY' ? 'bg-ink-blue/10 text-ink-blue' : 'bg-ink-red/10 text-ink-red'}`}>
                          {order.type}
                        </span>
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
                    <td className="px-4 py-4">
                      <Link className="font-bold text-ink-blue hover:underline" to={`/profile/${order.user.id}`}>
                        {order.user.username}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono">
                      <div>{formatDateTime(order.createdAt)}</div>
                      <div className="mt-1 opacity-60">{formatRelativeMinutes(order.waitMinutes)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase ${order.riskLevel === 'high' ? 'bg-red-100 text-ink-red' : order.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                        {order.riskLevel === 'high' ? <ShieldAlert size={14} /> : order.riskLevel === 'medium' ? <AlertTriangle size={14} /> : null}
                        {order.riskLevel}
                      </span>
                      {order.riskFlags.length > 0 ? (
                        <p className="mt-2 max-w-xs text-sm font-mono opacity-70">{order.riskFlags.join(' • ')}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
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
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : order.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-ink-red'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {order.status === 'PENDING' ? (
                          <>
                            <SketchyButton
                              className="px-3 py-2 text-sm text-ink-red"
                              disabled={rowAction === order.id}
                              onClick={() => {
                                void handleStatusUpdate(order.id, 'REJECTED');
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <X size={15} />
                                Reject
                              </span>
                            </SketchyButton>
                            <SketchyButton
                              className="px-3 py-2 text-sm text-green-700"
                              disabled={rowAction === order.id}
                              onClick={() => {
                                void handleStatusUpdate(order.id, 'DONE');
                              }}
                            >
                              <span className="flex items-center gap-2">
                                <Check size={15} />
                                Approve
                              </span>
                            </SketchyButton>
                          </>
                        ) : (
                          <span className="text-xs font-mono opacity-40">Final state</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SketchyContainer>

      {deskData ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-black/10 bg-white/80 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-mono opacity-60">
            Showing page {deskData.pagination.page} of {deskData.pagination.totalPages} • {deskData.pagination.total} total orders
          </p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border-2 border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40"
              disabled={deskData.pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded-full border-2 border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40"
              disabled={deskData.pagination.page >= deskData.pagination.totalPages}
              onClick={() => setPage((current) => Math.min(deskData.pagination.totalPages, current + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
