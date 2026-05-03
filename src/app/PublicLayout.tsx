import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { RouteLoading } from './RouteLoading';

function MarketingNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="text-sm font-semibold text-black/70 transition-colors hover:text-black"
      href={href}
    >
      {label}
    </a>
  );
}

export function PublicLayout() {
  const { user, isProfileComplete } = useAuth();
  const primaryHref = user ? (isProfileComplete ? '/play' : '/auth/complete-profile') : '/auth/register';
  const primaryLabel = user ? (isProfileComplete ? 'Open App' : 'Complete Profile') : 'Start Playing';

  return (
    <div className="min-h-screen paper-texture">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="group inline-flex items-center gap-3" to="/">
            <span className="font-display text-4xl font-bold italic tracking-tight text-ink-blue transition-transform group-hover:-rotate-1">
              4real
            </span>
            <span className="hidden rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-black/60 sm:inline-flex">
              Real-money Connect 4
            </span>
          </Link>

          <div className="hidden items-center gap-6 lg:flex">
            <MarketingNavLink href="/#how-it-works" label="How It Works" />
            <MarketingNavLink href="/#security" label="Security" />
            <MarketingNavLink href="/#features" label="Features" />
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <NavLink
                className="hidden items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/70 transition-colors hover:text-black md:inline-flex"
                to="/auth/security"
              >
                <ShieldCheck size={16} />
                Security
              </NavLink>
            ) : (
              <NavLink
                className="hidden rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/70 transition-colors hover:text-black md:inline-flex"
                to="/auth/login"
              >
                Sign in
              </NavLink>
            )}

            <NavLink
              className="inline-flex rounded-full bg-ink-blue px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              to={primaryHref}
            >
              {primaryLabel}
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
