import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { drawConnectFourBoard } from '../canvas/drawConnectFourBoard';
import { SketchyButton } from '../components/SketchyButton';
import { useAuth } from '../app/AuthProvider';
import { useElementSize } from '../hooks/useElementSize';
import { BarChart2, Trophy, Play, Clock, Wallet, Shield, Users } from 'lucide-react';

// ─── Animated Connect 4 board ─────────────────────────────────────────────────

type Cell = 'R' | 'B' | null;

const DEMO_SEQUENCE: [number, number, Cell][] = [
  [5, 3, 'R'], [5, 4, 'B'], [4, 3, 'R'], [5, 2, 'B'],
  [3, 3, 'R'], [5, 5, 'B'], [2, 3, 'R'], [5, 1, 'B'],
  [4, 4, 'R'], [4, 2, 'B'], [3, 4, 'R'], [4, 5, 'B'],
  [5, 0, 'R'], [3, 2, 'B'], [4, 1, 'R'], [3, 5, 'B'],
];

const WINNING_LINE: [number, number][] = [[2, 3], [3, 3], [4, 3], [5, 3]];

function buildEmptyBoard(): Cell[][] {
  return Array.from({ length: 6 }, () => Array<Cell>(7).fill(null));
}

function ConnectFourPreview() {
  const { elementRef, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [board, setBoard] = useState<Cell[][]>(buildEmptyBoard);
  const stepRef = useRef(0);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function tick() {
      const move = DEMO_SEQUENCE[stepRef.current];
      if (!move) {
        frameRef.current = setTimeout(() => {
          setBoard(buildEmptyBoard());
          stepRef.current = 0;
          frameRef.current = setTimeout(tick, 600);
        }, 2400);
        return;
      }
      const [row, col, color] = move;
      setBoard((prev) => {
        const next = prev.map((r) => [...r]);
        next[row]![col] = color;
        return next;
      });
      stepRef.current += 1;
      frameRef.current = setTimeout(tick, 380);
    }
    frameRef.current = setTimeout(tick, 600);
    return () => { if (frameRef.current) clearTimeout(frameRef.current); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    
    // R wins exactly at step 7 (index 6: [2, 3, 'R']).
    const winningLine = stepRef.current > 6 ? WINNING_LINE : undefined;
    drawConnectFourBoard(canvas, board, winningLine);
  }, [board, size]);

  return (
    <div ref={elementRef} className="relative w-full" style={{ aspectRatio: '7/6' }}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Sketch bar chart ─────────────────────────────────────────────────────────

function SketchBarChart() {
  const bars = [28, 45, 38, 62, 55, 75, 68];
  return (
    <svg viewBox="0 0 140 60" className="w-full h-full" aria-hidden="true">
      <line x1="8" y1="4" x2="8" y2="54" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="54" x2="138" y2="54" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" />
      {bars.map((h, i) => {
        const x = 14 + i * 18; const y = 54 - h * 0.62; const bh = h * 0.62;
        return (
          <g key={i}>
            <rect x={x} y={y} width={11} height={bh} fill="rgba(26,54,93,0.10)" stroke="#1A365D" strokeWidth="1.2" />
            {Array.from({ length: Math.floor(bh / 4) }).map((_, li) => (
              <line key={li} x1={x + 1} y1={y + li * 4 + 2} x2={x + 10} y2={y + li * 4 + 2} stroke="rgba(26,54,93,0.3)" strokeWidth="0.8" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Top players ──────────────────────────────────────────────────────────────

const TOP_PLAYERS = [
  { rank: 1, name: 'Navername', node: 'NODE: [ID]' },
  { rank: 2, name: 'Maigen',   node: 'NODE: [ID]' },
  { rank: 3, name: 'Loyalot', node: 'NODE: [ID]' },
  { rank: 4, name: 'Wanziomm',node: 'NODE: [ID]' },
  { rank: 5, name: 'Eikle',   node: 'NODE: [ID]' },
  { rank: 6, name: 'Magin',   node: 'NODE: [ID]' },
];

// ─── Landing Page ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: '01', title: 'Fund your balance',   body: 'Deposit USDT via TON wallet. Balance is always visible in-app.' },
  { n: '02', title: 'Challenge a player',  body: 'Create a public match or invite one opponent. Set the wager, lock the table.' },
  { n: '03', title: 'Win. Settle. Done.',  body: 'Server resolves the outcome, updates balances, and records history instantly.' },
] as const;

const FEATURES = [
  { icon: Trophy,   title: 'Real-money wagers',        body: 'Stake USDT in public or private matches. Every result settles transparently.' },
  { icon: Shield,   title: 'Verified accounts',        body: 'MFA, step-up checks, and session controls ship as first-class features.' },
  { icon: Clock,    title: 'Instant settlement',       body: 'Results resolve in real-time. Balances update the moment the move drops.' },
  { icon: Users,    title: 'Public & private tables',  body: 'Open lobby or a direct invite link to lock a two-player seat.' },
  { icon: BarChart2,title: 'Live leaderboard',         body: 'Real-time rankings track wins, earnings, and history across every session.' },
  { icon: Wallet,   title: 'Integrated wallet',        body: 'Deposit, withdraw, and manage your bankroll from one surface.' },
] as const;

export default function LandingPage() {
  const { user, isProfileComplete } = useAuth();
  const primaryHref  = user ? (isProfileComplete ? '/play' : '/auth/complete-profile') : '/auth/register';
  const primaryLabel = user ? (isProfileComplete ? 'Enter the lobby' : 'Complete profile') : 'Join the Grid';

  return (
    <div className="space-y-0">

      {/* ══ HERO ══════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="hero-heading"
        className="animate-in fade-in duration-400"
      >
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">

          {/* Left — Board preview */}
          <div className="rough-border bg-white p-5 relative shadow-xl">
            <div className="tape w-20 h-6 -top-2 left-8 rotate-1" />
            <div className="tape w-16 h-5 -top-2 right-12 -rotate-2 opacity-70" />

            <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">
              Live preview
            </p>

            <ConnectFourPreview />

            <div className="mt-4 flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full bg-ink-red"
                aria-hidden="true"
              />
              <p className="text-xs font-bold text-ink-red uppercase tracking-wide">
                Red connects 4 — winner!
              </p>
            </div>
          </div>

          {/* Right — Headline + cards */}
          <div className="space-y-6">

            {/* Live badge */}
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse" aria-hidden="true" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50">
                Real-money Connect 4
              </span>
            </div>

            {/* Headline */}
            <div className="relative inline-block">
              <h1
                id="hero-heading"
                className="font-display text-5xl lg:text-6xl font-bold italic tracking-tighter text-ink-black leading-none"
              >
                "Get Real.<br />Connect&nbsp;4."
              </h1>
              <div className="highlighter w-full bottom-2 left-0 h-5 scale-x-105" />
            </div>

            <p className="text-sm font-bold opacity-60 leading-7 max-w-sm">
              Head-to-head wagering on the classic grid game. Fund your balance,
              challenge a player, and let transparent settlement handle the rest.
            </p>

            {/* Info cards row */}
            <div className="grid grid-cols-2 gap-4">

              {/* Real-time Stats — blue sticky */}
              <div className="rough-border bg-[#E8F0FB] p-4 relative shadow-md">
                <div className="tape w-14 h-5 -top-2 right-3 rotate-2 opacity-60" />
                <div className="flex items-center gap-2 mb-2">
                  <BarChart2 size={14} className="text-ink-blue" aria-hidden="true" />
                  <p className="font-bold text-xs uppercase tracking-tighter text-ink-blue">Real-time Stats</p>
                </div>
                <div className="h-14">
                  <SketchBarChart />
                </div>
              </div>

              {/* Top Sketchers — yellow sticky note */}
              <div className="sticky-note rough-border p-4 relative shadow-md">
                <div className="tape w-14 h-5 -top-2 left-3 -rotate-1 opacity-60" />
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={12} className="opacity-60" aria-hidden="true" />
                  <p className="font-bold text-xs uppercase tracking-tighter">Top Sketchers</p>
                </div>
                <ol className="space-y-0.5" aria-label="Top players">
                  {TOP_PLAYERS.map((p) => (
                    <li key={p.rank} className="flex items-center justify-between text-[9px] font-mono font-bold">
                      <span>{p.name}</span>
                      <span className="opacity-40">{p.node}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Link to={primaryHref}>
                <SketchyButton
                  className="px-8 py-3 text-base font-bold"
                  activeColor="#fff9c4"
                >
                  {primaryLabel}
                </SketchyButton>
              </Link>
              {!user && (
                <Link
                  to="/auth/login"
                  className="text-sm font-bold opacity-50 hover:opacity-100 transition-opacity py-3 underline"
                >
                  Already have an account?
                </Link>
              )}
            </div>

            {/* Trust badges */}
            <ul className="flex flex-wrap gap-2" aria-label="Trust indicators">
              {['Verified accounts', 'Protected sessions', 'Wallet controls', 'Rate-limited sign-in'].map((item) => (
                <li
                  key={item}
                  className="text-[10px] font-bold uppercase tracking-widest opacity-50 border-2 border-black/10 px-3 py-1"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ══ JOIN THE GRID CTA BANNER ══════════════════════════════════ */}
      <section aria-label="Primary call to action" className="my-10">
        <Link to={primaryHref} className="block group">
          <div
            className="relative overflow-hidden border-y-4 border-ink-black bg-ink-red py-5 sm:py-6 text-center transition-opacity hover:opacity-90 duration-200"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg,#fff 0,#fff 4px,transparent 4px,transparent 20px)',
              }}
            />
            <span className="relative font-bold italic text-3xl sm:text-4xl text-white tracking-tighter uppercase transition-transform duration-200 group-hover:scale-105 inline-block">
              JOIN THE GRID
            </span>
          </div>
        </Link>
      </section>

      {/* ══ HOW IT WORKS ══════════════════════════════════════════════ */}
      <section aria-labelledby="how-it-works-heading" className="py-8 space-y-8">
        <header>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50">How it works</p>
          <div className="relative inline-block mt-2">
            <h2 id="how-it-works-heading" className="font-display text-4xl font-bold italic tracking-tighter">
              Three moves to the table.
            </h2>
            <div className="highlighter w-full bottom-1 left-0 h-4 scale-x-105" />
          </div>
          <p className="mt-3 text-sm font-bold opacity-60 leading-6">
            No complex onboarding. Get money in, find a match, and play.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="sticky-note rough-border p-6 relative shadow-md">
              <div className="tape w-16 h-5 -top-2 left-1/2 -translate-x-1/2 rotate-1 opacity-70" />
              <p className="font-bold text-5xl italic tracking-tighter opacity-15 leading-none select-none">
                {step.n}
              </p>
              <h3 className="font-display mt-2 font-bold text-xl italic tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm font-bold opacity-60 leading-6">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES ══════════════════════════════════════════════════ */}
      <section aria-labelledby="features-heading" className="py-8 space-y-8">
        <header>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50">Features</p>
          <div className="relative inline-block mt-2">
            <h2 id="features-heading" className="font-display text-4xl font-bold italic tracking-tighter">
              Built for real play.
            </h2>
            <div className="highlighter w-full bottom-1 left-0 h-4 scale-x-105" />
          </div>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rough-border bg-white p-5 shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <Icon size={20} className="text-ink-blue opacity-80" aria-hidden="true" />
                <h3 className="font-display font-bold text-lg uppercase tracking-tight">{title}</h3>
              </div>
              <p className="text-sm font-bold opacity-60 leading-6">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════ */}
      <section aria-labelledby="final-cta-heading" className="py-8">
        <div className="rough-border bg-white p-8 sm:p-12 text-center relative shadow-xl">
          <div className="tape w-24 h-6 -top-2 left-1/2 -ml-12 rotate-1" />

          <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-40">Ready?</p>

          <div className="relative inline-block mt-3">
            <h2 id="final-cta-heading" className="font-display text-4xl sm:text-5xl font-bold italic tracking-tighter">
              One match. Real stakes.
            </h2>
            <div className="highlighter w-full bottom-1 left-0 h-4 scale-x-105" />
          </div>

          <p className="mt-4 text-sm font-bold opacity-60 leading-7 max-w-md mx-auto">
            Start with a verified account and your first deposit. Everything else —
            match creation, settlement, and history — is handled for you.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={primaryHref}>
              <SketchyButton
                className="px-10 py-3 text-base font-bold"
                activeColor="#fff9c4"
              >
                {primaryLabel}
              </SketchyButton>
            </Link>
            {!user && (
              <Link
                to="/auth/login"
                className="text-sm font-bold opacity-50 hover:opacity-100 transition-opacity underline"
              >
                Sign in instead
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════ */}
      <footer className="border-t-4 border-ink-black/80 py-5 mt-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-1 text-sm font-bold">
              {[
                { label: 'how it works', href: '#how-it-works' },
                { label: 'privacy policy', href: '/privacy' },
                { label: 'terms of use', href: '/terms' },
                { label: 'community', href: '#community' },
              ].map((link, i, arr) => (
                <li key={link.label} className="flex items-center gap-1">
                  {link.href.startsWith('#') ? (
                    <a href={link.href} className="opacity-50 hover:opacity-100 transition-opacity">
                      {link.label}
                    </a>
                  ) : (
                    <Link to={link.href} className="opacity-50 hover:opacity-100 transition-opacity">
                      {link.label}
                    </Link>
                  )}
                  {i < arr.length - 1 && (
                    <span aria-hidden="true" className="opacity-25 select-none">|</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <p className="text-xs font-bold italic opacity-30 hidden sm:block">
            No ink has been spilled yet.
          </p>

          <div className="flex items-center gap-3">
            <p className="text-xs font-mono font-bold opacity-40">© 2026 4real</p>
            <span
              className="font-mono text-xs font-bold border-2 border-ink-blue text-ink-blue px-2 py-0.5 rotate-1 inline-block"
              aria-label="Status: Live"
            >
              LIVE
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
