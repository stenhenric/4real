import type { ReactNode } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

export function TonConnectRouteProvider({ children }: { children: ReactNode }) {
  const manifestUrl =
    import.meta.env.VITE_TON_MANIFEST_URL || `${window.location.origin}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
