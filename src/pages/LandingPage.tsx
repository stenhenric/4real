import { ArrowRight, LockKeyhole, ShieldCheck, Smartphone, Trophy, Wallet, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { useAuth } from '../app/AuthProvider';

const TRUST_ITEMS = [
  'Verified accounts',
  'Protected sessions',
  'Wallet controls',
  'Rate-limited sign-in',
] as const;

const STEPS = [
  {
    step: '01',
    title: 'Fund your balance',
    body: 'Deposit USDT, track ledger updates, and keep wallet actions inside one clear bank surface.',
  },
  {
    step: '02',
    title: 'Challenge a player',
    body: 'Create public or private matches, set the stake, and invite another player into a live table.',
  },
  {
    step: '03',
    title: 'Settle transparently',
    body: 'The server resolves results, updates balances, and records match history without off-platform coordination.',
  },
] as const;

const FEATURES = [
  {
    icon: Trophy,
    title: 'Private and public tables',
    body: 'Run invite-only money matches or join open lobby play with clear stakes.',
  },
  {
    icon: Wallet,
    title: 'Integrated wallet flows',
    body: 'Handle deposits, withdrawals, and merchant-assisted fiat ramps from the same account surface.',
  },
  {
    icon: ShieldCheck,
    title: 'Visible session security',
    body: 'Review every device session, revoke old devices, and enable multi-factor protection yourself.',
  },
  {
    icon: Smartphone,
    title: 'Step-up for sensitive actions',
    body: 'Withdrawals, merchant operations, and session revocation require recent verification.',
  },
  {
    icon: LockKeyhole,
    title: 'Account recovery controls',
    body: 'Magic links, password reset, recovery codes, and email verification work as first-class flows.',
  },
  {
    icon: Zap,
    title: 'Fast product surfaces',
    body: 'Mobile-first layouts keep entry, match creation, and bankroll visibility clear on smaller screens.',
  },
] as const;

function ProductPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[30px] border border-black/10 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/40">Live Lobby</p>
            <h3 className="mt-2 text-2xl font-bold">Challenge-ready tables</h3>
          </div>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold uppercase text-green-800">
            Real-time
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Public lobby</p>
            <p className="mt-3 text-3xl font-black text-ink-blue">Open Match</p>
            <p className="mt-2 text-sm text-black/65">0.00 to 10.00 USDT entries with visible payout math.</p>
          </div>
          <div className="rounded-[24px] border border-black/10 bg-[#FBFAF7] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Private invite</p>
            <p className="mt-3 text-3xl font-black">Direct seat claim</p>
            <p className="mt-2 text-sm text-black/65">Send one link and lock a two-player table immediately.</p>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-black/10 bg-ink-blue/[0.04] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-black/45">Projected payout</p>
              <p className="mt-2 text-3xl font-black text-ink-blue">18.40 USDT</p>
            </div>
            <div className="grid grid-cols-7 gap-1 rounded-[18px] border border-ink-blue/15 bg-white p-3">
              {Array.from({ length: 21 }, (_, index) => (
                <span
                  key={index}
                  className={`h-4 w-4 rounded-full border ${index % 5 === 0 ? 'border-ink-red bg-ink-red/80' : index % 4 === 0 ? 'border-ink-blue bg-ink-blue/80' : 'border-ink-blue/30 bg-white'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[30px] border border-black/10 bg-white p-5 shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/40">Bank Surface</p>
          <p className="mt-3 text-3xl font-black text-ink-blue">42.50 USDT</p>
          <p className="mt-2 text-sm text-black/65">Balance, deposits, withdrawals, and merchant rail from one ledger view.</p>
        </div>
        <div className="rounded-[30px] border border-black/10 bg-white p-5 shadow-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/40">Security Center</p>
          <ul className="mt-4 space-y-3 text-sm text-black/70">
            <li>Current device session highlighted.</li>
            <li>TOTP MFA setup and recovery codes available.</li>
            <li>Revoke other devices with step-up protection.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user, isProfileComplete } = useAuth();
  const primaryHref = user ? (isProfileComplete ? '/play' : '/auth/complete-profile') : '/auth/register';
  const primaryLabel = user ? (isProfileComplete ? 'Enter the lobby' : 'Complete your profile') : 'Start Playing';

  return (
    <div className="space-y-20 pb-16">
      <section className="relative overflow-hidden rounded-[44px] border border-black/10 bg-[linear-gradient(135deg,#f7f4ec_0%,#fbfaf7_48%,#e7eef9_100%)] px-6 py-10 shadow-2xl sm:px-8 lg:px-10 lg:py-14">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(26,54,93,0.16),transparent_60%)] lg:block" />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)] lg:items-center">
          <div className="relative z-10">
            <div className="inline-flex items-center rounded-full border border-black/10 bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-black/55">
              Skill-based Connect 4 with real-money rails
            </div>
            <h1 className="mt-6 max-w-3xl text-5xl font-black tracking-tight text-ink-black sm:text-6xl lg:text-7xl">
              Real competition, clean settlement, visible security.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-black/70">
              4real turns Connect 4 into a head-to-head wagering product with verified accounts, protected sessions, and bank flows designed to stay understandable on first glance.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={primaryHref}>
                <SketchyButton className="w-full px-8 py-3 text-base sm:w-auto">
                  {primaryLabel}
                </SketchyButton>
              </Link>
              <a
                className="inline-flex items-center justify-center rounded-full border border-black/12 bg-white px-6 py-3 text-base font-semibold text-black transition-colors hover:bg-black/5"
                href="#how-it-works"
              >
                How it works
              </a>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_ITEMS.map((item) => (
                <div key={item} className="rounded-full border border-black/10 bg-white/80 px-4 py-3 text-sm font-semibold text-black/70">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10">
            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="space-y-8" id="how-it-works">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/45">Product Flow</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-black sm:text-5xl">
            The product explains itself in three moves.
          </h2>
          <p className="mt-4 text-lg leading-8 text-black/70">
            No technical framing required. Get money in, create a match, and let the platform handle settlement and records.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {STEPS.map((item) => (
            <SketchyContainer key={item.step} className="bg-white/92 p-6 shadow-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/40">{item.step}</p>
              <h3 className="mt-4 text-2xl font-black text-ink-black">{item.title}</h3>
              <p className="mt-3 text-base leading-7 text-black/70">{item.body}</p>
            </SketchyContainer>
          ))}
        </div>
      </section>

      <section className="space-y-8" id="security">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <SketchyContainer className="bg-[#F7F4EC] p-6 shadow-xl sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/45">Security Model</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-black">
              Trust language that matches shipped controls.
            </h2>
            <p className="mt-4 text-base leading-7 text-black/70">
              We explain security in plain product language: protected sessions, verified access, step-up checks for sensitive actions, and visible device control.
            </p>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[26px] border border-black/10 bg-white p-4">
                <h3 className="text-lg font-bold">Encrypted session handling</h3>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  The app rotates session secrets, scopes them to devices, and exposes current sessions back to the player.
                </p>
              </div>
              <div className="rounded-[26px] border border-black/10 bg-white p-4">
                <h3 className="text-lg font-bold">Secure authentication</h3>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  Email verification, password hashing, magic links, Google OAuth, and TOTP MFA are first-class flows.
                </p>
              </div>
              <div className="rounded-[26px] border border-black/10 bg-white p-4">
                <h3 className="text-lg font-bold">Fraud-aware entry controls</h3>
                <p className="mt-2 text-sm leading-6 text-black/70">
                  Rate limiting, suspicious sign-in review, and step-up requirements reduce account takeover paths without hiding the UX.
                </p>
              </div>
            </div>
          </SketchyContainer>

          <div className="grid gap-6 md:grid-cols-2">
            <SketchyContainer className="bg-white/92 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-ink-blue" size={24} />
                <h3 className="text-2xl font-black">Visible device sessions</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/70">
                Players can inspect current and previous sessions, revoke devices, and force fresh sign-in when needed.
              </p>
            </SketchyContainer>
            <SketchyContainer className="bg-white/92 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <Smartphone className="text-ink-blue" size={24} />
                <h3 className="text-2xl font-black">MFA where it matters</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/70">
                High-risk and treasury actions demand a recent TOTP step-up instead of assuming the base session is enough.
              </p>
            </SketchyContainer>
            <SketchyContainer className="bg-white/92 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <LockKeyhole className="text-ink-blue" size={24} />
                <h3 className="text-2xl font-black">Single-use recovery links</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/70">
                Verification, reset, and magic links are short-lived and designed for one-time consumption.
              </p>
            </SketchyContainer>
            <SketchyContainer className="bg-white/92 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <Wallet className="text-ink-blue" size={24} />
                <h3 className="text-2xl font-black">Wallet controls in-product</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/70">
                Balance, deposit, withdrawal, and merchant actions stay inside the same accountable interface.
              </p>
            </SketchyContainer>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/45">Social Proof</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-black sm:text-5xl">
            Placeholder structure, no fabricated praise.
          </h2>
          <p className="mt-4 text-lg leading-8 text-black/70">
            Testimonial slots and product metrics are wired in, but they stay explicit placeholders until verified usage data exists.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {['Player quote slot', 'Merchant partner quote slot', 'Early beta quote slot'].map((title) => (
            <SketchyContainer key={title} className="bg-white/92 p-6 shadow-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/45">Reserved</p>
              <h3 className="mt-4 text-2xl font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-black/65">
                Live testimonial copy will appear here only after real, attributable feedback is collected.
              </p>
            </SketchyContainer>
          ))}
        </div>
      </section>

      <section className="space-y-8" id="features">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/45">Features</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-black sm:text-5xl">
            Clear product promises, not jargon.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => (
            <SketchyContainer key={feature.title} className="bg-white/92 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-ink-blue/10 p-2 text-ink-blue">
                  <feature.icon size={20} />
                </div>
                <h3 className="text-xl font-black">{feature.title}</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/70">{feature.body}</p>
            </SketchyContainer>
          ))}
        </div>
      </section>

      <section className="rounded-[40px] border border-black/10 bg-white/92 px-6 py-10 shadow-xl sm:px-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-black/45">Final CTA</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-black sm:text-5xl">
              Start with a verified account, then play with confidence.
            </h2>
            <p className="mt-4 text-lg leading-8 text-black/70">
              The landing page stays simple on purpose: one primary action, one secondary explanation path, and trust claims that align with the live system.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center rounded-full bg-ink-blue px-6 py-3 text-base font-semibold text-white transition-transform hover:-translate-y-0.5"
              to={primaryHref}
            >
              {primaryLabel}
            </Link>
            <a
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/12 bg-white px-6 py-3 text-base font-semibold text-black transition-colors hover:bg-black/5"
              href="#security"
            >
              Review security
              <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
