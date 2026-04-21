/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

// Components
import Navbar from './components/Navbar';
import AuthView from './views/AuthView';
import DashboardView from './views/DashboardView';
import BankView from './views/BankView';
import GameView from './views/GameView';
import ProfileView from './views/ProfileView';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-screen flex items-center justify-center font-sans text-2xl animate-pulse">
      Loading your notebook...
    </div>
  );
  if (!user) return <Navigate to="/auth" />;
  return <>{children}</>;
};

function AppRoutes() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col paper-texture">
      {user && <Navbar />}
      <main className="flex-1 container mx-auto px-4 py-8">
        <Routes>
          <Route path="/auth" element={!user ? <AuthView /> : <Navigate to="/" />} />
          <Route path="/" element={<ProtectedRoute><DashboardView /></ProtectedRoute>} />
          <Route path="/bank" element={<ProtectedRoute><BankView /></ProtectedRoute>} />
          <Route path="/game/:roomId" element={<ProtectedRoute><GameView /></ProtectedRoute>} />
          <Route path="/profile/:userId" element={<ProtectedRoute><ProfileView /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  // @ts-ignore
  const manifestUrl = import.meta.env.VITE_TON_MANIFEST_URL || `${window.location.origin}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TonConnectUIProvider>
  );
}
