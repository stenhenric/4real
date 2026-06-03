import { LoaderCircle } from 'lucide-react';
import { StatePanel } from '../components/ui/StatePanel';

interface RouteLoadingProps {
  message?: string;
}

export function RouteLoading({ message = 'Loading your notebook...' }: RouteLoadingProps) {
  return (
    <StatePanel
      eyebrow="Loading"
      icon={LoaderCircle}
      iconClassName="animate-spin"
      title={message}
      tone="info"
    />
  );
}
