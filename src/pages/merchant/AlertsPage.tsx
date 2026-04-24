import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SketchyContainer } from '../../components/SketchyContainer';
import { useMerchantOutletContext } from '../../components/merchant/MerchantLayout';
import { formatDateTime } from '../../features/merchant/format';

export default function AlertsPage() {
  const { dashboard } = useMerchantOutletContext();

  if (!dashboard) {
    return null;
  }

  const criticalCount = dashboard.alerts.filter((alert) => alert.severity === 'critical').length;
  const warningCount = dashboard.alerts.filter((alert) => alert.severity === 'warning').length;
  const infoCount = dashboard.alerts.filter((alert) => alert.severity === 'info').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-bold italic tracking-tight">Alerts & Risk</h2>
        <p className="text-sm font-mono opacity-60">
          Consolidated operational signals from the order queue, balance checks, deposits, withdrawals, and worker runtime.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Critical</p>
          <p className="mt-4 text-5xl font-bold italic text-ink-red">{criticalCount}</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Warnings</p>
          <p className="mt-4 text-5xl font-bold italic text-yellow-800">{warningCount}</p>
        </SketchyContainer>
        <SketchyContainer className="bg-white">
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-50">Informational</p>
          <p className="mt-4 text-5xl font-bold italic text-ink-blue">{infoCount}</p>
        </SketchyContainer>
      </div>

      <SketchyContainer className="bg-white">
        <div className="flex items-center gap-3 border-b border-black/10 pb-3">
          <ShieldAlert className="text-ink-red" size={22} />
          <div>
            <h3 className="text-2xl font-bold italic">Active Alert Feed</h3>
            <p className="text-sm font-mono opacity-60">Most severe issues are shown first. Use the target links to jump into the relevant workflow.</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {dashboard.alerts.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-black/10 px-6 py-10 text-center text-sm font-mono opacity-50">
              No active alerts. All monitored systems are within expected bounds.
            </div>
          ) : (
            dashboard.alerts.map((alert) => (
              <div key={alert.id} className="rounded-3xl border border-black/10 bg-black/5 px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${alert.severity === 'critical' ? 'bg-red-100 text-ink-red' : alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-ink-blue'}`}>
                        {alert.severity}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase opacity-70">
                        {alert.category}
                      </span>
                    </div>
                    <h4 className="mt-3 text-2xl font-bold italic">{alert.title}</h4>
                    <p className="mt-2 text-sm font-mono opacity-70">{alert.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono opacity-60">
                      {alert.metric ? <span>Metric {alert.metric}</span> : null}
                      {alert.createdAt ? <span>Observed {formatDateTime(alert.createdAt)}</span> : null}
                    </div>
                  </div>

                  {alert.targetPath ? (
                    <Link
                      className="inline-flex items-center gap-2 self-start rounded-full border-2 border-ink-blue px-4 py-2 text-sm font-bold text-ink-blue transition-colors hover:bg-ink-blue/10"
                      to={alert.targetPath}
                    >
                      Open target
                      <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <AlertTriangle className="text-black/20" size={24} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SketchyContainer>
    </div>
  );
}
