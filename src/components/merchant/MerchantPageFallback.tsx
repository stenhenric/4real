import { AlertTriangle, RefreshCw } from 'lucide-react';
import { SketchyButton } from '../SketchyButton';
import { SketchyContainer } from '../SketchyContainer';
import { cn } from '../../utils/cn';
import { useMerchantOutletContext } from './MerchantLayout';

interface MerchantPageFallbackProps {
  title: string;
  description: string;
}

export function MerchantPageFallback({ title, description }: MerchantPageFallbackProps) {
  const { error, isRefreshing, refreshDashboard } = useMerchantOutletContext();

  return (
    <SketchyContainer className="bg-white">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 text-ink-red">
            <AlertTriangle size={22} />
            <p className="text-xs font-bold uppercase tracking-[0.25em]">Live Merchant Data Unavailable</p>
          </div>
          <h2 className="mt-4 text-4xl font-bold italic tracking-tight">{title}</h2>
          <p className="mt-3 text-sm font-mono opacity-70">{description}</p>
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-mono text-ink-red">
            {error ?? 'The shared merchant dashboard request is still unavailable.'}
          </div>
        </div>

        <SketchyButton
          className="self-start px-4 py-3 text-sm font-bold"
          disabled={isRefreshing}
          onClick={() => {
            void refreshDashboard();
          }}
        >
          <span className="flex items-center gap-2">
            <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Retrying...' : 'Retry dashboard'}
          </span>
        </SketchyButton>
      </div>
    </SketchyContainer>
  );
}
