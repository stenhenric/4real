import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';
import { SketchyButton } from '../components/SketchyButton';

function MarketingNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="font-bold text-lg text-black/70 hover:text-black transition-colors"
      href={href}
    >
      {label}
    </a>
  );
}

export function PublicLayout() {
  const { user, isProfileComplete } = useAuth();
  const { pathname } = useLocation();

  const primaryHref  = user ? (isProfileComplete ? '/play' : '/auth/complete-profile') : '/auth/register';
  const primaryLabel = user ? (isProfileComplete ? 'Open App' : 'Complete Profile') : 'Start Playing';

  // Header is only shown on the landing page root
  const isLanding = pathname === '/';

  return (
    <div className="min-h-screen paper-texture">
      {isLanding && (
        <header className="sticky top-0 z-40 border-b-2 border-ink-black bg-paper/95 backdrop-blur-sm shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <Link to="/" className="relative group flex items-center">
              <div className="relative inline-block">
                <span className="font-display text-4xl font-bold italic transform -rotate-2 group-hover:rotate-0 transition-all inline-block relative z-10" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>
                  4real
                </span>
                <div className="highlighter w-full bottom-1 left-0 group-hover:scale-x-110 transition-transform"></div>
              </div>
              <span className="hidden ml-4 sticky-note px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-black sm:inline-flex opacity-80 border border-ink-black/20 transform rotate-1">
                Real-money Connect 4
              </span>
            </Link>

            <div className="hidden items-center gap-8 lg:flex">
              <MarketingNavLink href="/#how-it-works" label="How It Works" />
              <MarketingNavLink href="/#features" label="Features" />
            </div>

            <div className="flex items-center gap-4">
              {!user && (
                <NavLink
                  className="hidden rough-border bg-white px-5 py-2 text-sm font-bold uppercase tracking-tight text-ink-black transition-all hover:-translate-y-0.5 hover:shadow-md md:inline-flex"
                  to="/auth/login"
                >
                  Sign in
                </NavLink>
              )}

              <Link to={primaryHref}>
                <SketchyButton
                  className="px-6 py-2 text-sm font-bold shadow-md hover:-translate-y-0.5 transition-all"
                  activeColor="#fff9c4"
                >
                  {primaryLabel}
                </SketchyButton>
              </Link>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
