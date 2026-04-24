import type { ReactNode } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { AuthProvider } from './AuthProvider';
import { ToastProvider } from './ToastProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const manifestUrl =
    import.meta.env.VITE_TON_MANIFEST_URL || `${window.location.origin}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </TonConnectUIProvider>
  );
}
