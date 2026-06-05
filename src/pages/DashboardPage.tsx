import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Play, Plus, Trophy, User as UserIcon } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { EmptyState } from '../components/ui/EmptyState';
import { createMatch, getActiveMatches } from '../services/matches.service';
import { getLeaderboard } from '../services/users.service';
import { createGameSocket } from '../sockets/gameSocket';
import { PUBLIC_MATCHES_UPDATED_EVENT } from '../../shared/socket-events';
import { isAbortError } from '../utils/isAbortError';
import { formatMoneyValue, moneyToNumber, normalizeFixedScaleAmount } from '../utils/exact-money.ts';
import { getApiErrorMessage } from '../utils/errors';
import type { LeaderboardUserDTO, MatchDTO, UserDTO } from '../types/api';
import { createInitialDashboardDraftState, dashboardDraftReducer } from './dashboardDraftReducer';

type DashboardTab = 'lobby' | 'leaderboard' | 'archives' | 'stats';

interface DashboardPageProps {
  initialTab?: DashboardTab;
}

const DASHBOARD_TABS: ReadonlyArray<{ id: DashboardTab; icon: typeof Play; label: string }> = [
  { id: 'lobby', icon: Play, label: 'Lobby' },
  { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
  { id: 'archives', icon: Clock, label: 'Archives' },
  { id: 'stats', icon: UserIcon, label: 'Stats' },
];

function DashboardTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}) {
  return (
    <div
      aria-label="Dashboard sections"
      className="-mx-4 mb-8 flex gap-3 overflow-x-auto border-b-4 border-black/10 bg-paper p-4 sticky top-0 z-20 md:mx-0 md:flex-wrap md:px-0"
      role="tablist"
    >
      {DASHBOARD_TABS.map(({ id, icon: Icon, label }) => (
        <SketchyButton
          activeColor="var(--color-note-yellow)"
          aria-controls={`dashboard-panel-${id}`}
          aria-selected={activeTab === id}
          className={`flex shrink-0 items-center gap-2 text-base sm:text-xl ${activeTab === id ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
          fill={activeTab === id ? 'var(--color-note-yellow)' : 'transparent'}
          id={`dashboard-tab-${id}`}
          key={id}
          onClick={() => onTabChange(id)}
          role="tab"
        >
          <Icon size={20} /> {label}
        </SketchyButton>
      ))}
    </div>
  );
}

function DraftCreationPanel({
  draftStep,
  draftType,
  isCreatingMatch,
  onBack,
  onCancel,
  onCreate,
  onNext,
  onSelectDraftType,
  onWagerChange,
  userBalance,
  wager,
}: {
  draftStep: number;
  draftType: 'private' | 'free_public' | 'paid_public' | null;
  isCreatingMatch: boolean;
  onBack: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onNext: () => void;
  onSelectDraftType: (draftType: 'private' | 'free_public' | 'paid_public') => void;
  onWagerChange: (wager: string) => void;
  userBalance: string | undefined;
  wager: string;
}) {
  return (
    <div className="mb-8 p-6 bg-paper rough-border relative z-10 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="tape w-16 h-6 -top-2 left-4 -rotate-2 opacity-60"></div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-semibold italic tracking-tight underline decoration-wavy">Draft Creation</h3>
        <SketchyButton className="text-sm font-bold uppercase opacity-50 hover:opacity-100" onClick={onCancel}>
          Cancel
        </SketchyButton>
      </div>

      {draftStep === 1 ? (
        <div className="space-y-4">
          <p className="font-bold uppercase opacity-50 text-sm mb-4">Step 1: Select Match Type</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup" aria-label="Match type">
            {[
              ['private', 'Private Match', 'Hidden from lobby. Invite code required.'],
              ['free_public', 'Free Public', 'Visible in Free lobby. No wager.'],
              ['paid_public', 'Paid Public', 'Visible in Paid lobby. Wager required.'],
            ].map(([type, label, description]) => (
              <SketchyButton
                aria-checked={draftType === type}
                fill={draftType === type ? 'var(--color-note-yellow)' : 'transparent'}
                className="flex size-full flex-col items-center justify-center p-4 text-center"
                key={type}
                onClick={() => onSelectDraftType(type as 'private' | 'free_public' | 'paid_public')}
                role="radio"
                type="button"
              >
                <span className="font-bold text-lg mb-2">{label}</span>
                <span className="text-xs opacity-60 text-center">{description}</span>
              </SketchyButton>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <SketchyButton
              className="px-8"
              disabled={!draftType || isCreatingMatch}
              onClick={onNext}
              type="button"
            >
              {isCreatingMatch ? 'Creating…' : draftType === 'free_public' ? 'Create Match' : 'Next Step'}
            </SketchyButton>
          </div>
        </div>
      ) : null}

      {draftStep === 2 ? (
        <div className="space-y-4">
          <p className="font-bold uppercase opacity-50 text-sm mb-4">Step 2: Set Wager</p>
          <div className="flex flex-col items-start">
            <label className="font-bold text-lg mb-2" htmlFor="draft-wager">
              Wager Amount (USDT)
            </label>
            <input
              className="w-full max-w-xs bg-transparent border-b-4 border-black font-bold text-2xl outline-none p-2 focus:bg-white/50 transition-colors"
              id="draft-wager"
              onChange={(event) => onWagerChange(event.target.value)}
              type="number"
              value={wager}
              min={draftType === 'paid_public' ? '0.000001' : '0'}
              step="0.000001"
            />
            <p className="text-xs opacity-50 mt-2 font-bold uppercase">Available balance: {formatMoneyValue(userBalance)} USDT</p>
          </div>

          <div className="flex justify-between mt-6">
            <SketchyButton onClick={onBack} type="button">Back</SketchyButton>
            <SketchyButton
              onClick={onCreate}
              className="bg-black/5"
              disabled={isCreatingMatch}
              type="button"
            >
              {isCreatingMatch ? 'Creating…' : 'Create Match'}
            </SketchyButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchColumn({
  matches,
  onJoin,
  paid,
  title,
}: {
  matches: MatchDTO[];
  onJoin: (roomId: string) => void;
  paid: boolean;
  title: string;
}) {
  return (
    <div>
      <h3 className={`font-semibold text-xl uppercase tracking-tighter mb-4 flex items-center gap-2 ${paid ? 'text-warning-text' : 'opacity-50'}`}>
        {title} <span className={paid ? 'text-xs bg-note-yellow text-black px-2 py-0.5' : 'text-xs bg-ink-black text-surface px-2 py-0.5'}>{matches.length}</span>
      </h3>
      <div className="space-y-4">
        {matches.length === 0 ? (
          <EmptyState>No {paid ? 'paid' : 'free'} drafts…</EmptyState>
        ) : (
          matches.map((match) => (
            <div
              key={match._id ?? match.roomId}
              className="group relative p-5 bg-white rough-border hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
            >
              {paid ? (
                <div className="absolute -left-2 -top-2 bg-note-yellow text-black font-bold text-[10px] px-2 py-1 rotate-[-5deg] rough-border shadow-sm z-10">
                  {formatMoneyValue(match.wager)} USDT
                </div>
              ) : null}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-20">
                <Clock size={10} /> <span className="text-[9px] font-mono">LIVE</span>
              </div>
              <div className={`mb-3 ${paid ? 'mt-2' : ''}`}>
                <h4 className="font-semibold text-lg uppercase tracking-tight">{match.p1Username}</h4>
                <p className="text-[10px] font-mono opacity-40 font-bold">
                  Room: {match.roomId.toUpperCase()}
                </p>
              </div>
              <SketchyButton
                className="w-full text-sm py-2"
                onClick={() => onJoin(match.roomId)}
                {...(paid ? { fill: 'var(--color-note-yellow)' } : {})}
              >
                {paid ? 'Join & Wager' : 'Join for Free'}
              </SketchyButton>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LobbyPanel({
  draftStep,
  draftType,
  freeMatches,
  isCreatingMatch,
  isDrafting,
  onBackDraft,
  onCancelDraft,
  onCreateMatch,
  onJoinMatch,
  onNextDraftStep,
  onOpenDraft,
  onSelectDraftType,
  onWagerChange,
  paidMatches,
  userBalance,
  wager,
}: {
  draftStep: number;
  draftType: 'private' | 'free_public' | 'paid_public' | null;
  freeMatches: MatchDTO[];
  isCreatingMatch: boolean;
  isDrafting: boolean;
  onBackDraft: () => void;
  onCancelDraft: () => void;
  onCreateMatch: () => void;
  onJoinMatch: (roomId: string) => void;
  onNextDraftStep: () => void;
  onOpenDraft: () => void;
  onSelectDraftType: (draftType: 'private' | 'free_public' | 'paid_public') => void;
  onWagerChange: (wager: string) => void;
  paidMatches: MatchDTO[];
  userBalance: string | undefined;
  wager: string;
}) {
  return (
    <section
      aria-labelledby="dashboard-tab-lobby"
      className="rough-border bg-white p-8 relative shadow-xl overflow-hidden max-w-4xl mx-auto w-full"
      id="dashboard-panel-lobby"
      role="tabpanel"
    >
      <div className="tape w-24 h-6 -top-2 left-1/2 -ml-12 rotate-1"></div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 relative z-10 gap-6">
        <div className="relative inline-block">
          <h2 className="text-4xl font-semibold flex items-center gap-3 italic tracking-tighter underline decoration-wavy">
            <Play className="fill-ink-black" size={32} /> Central Lobby
          </h2>
          <div className="highlighter w-full bottom-2 left-0 h-4 scale-x-110"></div>
        </div>
        {!isDrafting ? (
          <div className="flex flex-col items-end gap-2 text-right w-full md:w-auto">
            <SketchyButton
              className="flex items-center gap-2 text-xl px-10 w-full md:w-auto justify-center"
              onClick={onOpenDraft}
            >
              <Plus size={24} /> New Draft
            </SketchyButton>
          </div>
        ) : null}
      </div>

      {isDrafting ? (
        <DraftCreationPanel
          draftStep={draftStep}
          draftType={draftType}
          isCreatingMatch={isCreatingMatch}
          onBack={onBackDraft}
          onCancel={onCancelDraft}
          onCreate={onCreateMatch}
          onNext={onNextDraftStep}
          onSelectDraftType={onSelectDraftType}
          onWagerChange={onWagerChange}
          userBalance={userBalance}
          wager={wager}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 mt-12">
          <MatchColumn matches={freeMatches} onJoin={onJoinMatch} paid={false} title="Free Public" />
          <MatchColumn matches={paidMatches} onJoin={onJoinMatch} paid={true} title="Paid Public" />
        </div>
      )}
    </section>
  );
}

function ArchivesPanel() {
  return (
    <section
      aria-labelledby="dashboard-tab-archives"
      className="rough-border bg-white/50 p-8 shadow-inner relative max-w-4xl mx-auto w-full"
      id="dashboard-panel-archives"
      role="tabpanel"
    >
      <h2 className="text-3xl font-semibold flex items-center gap-3 italic mb-8 opacity-40">
        <Clock size={28} /> Archives
      </h2>
      <div className="py-12 border-2 border-dashed border-black/5 text-center">
        <p className="italic opacity-20 font-bold uppercase tracking-widest text-sm">
          Historical records pending match completion…
        </p>
      </div>
    </section>
  );
}

function LeaderboardPanel({ leaderboard }: { leaderboard: LeaderboardUserDTO[] }) {
  return (
    <section
      aria-labelledby="dashboard-tab-leaderboard"
      className="sticky-note p-8 rough-border shadow-2xl relative max-w-2xl mx-auto w-full"
      id="dashboard-panel-leaderboard"
      role="tabpanel"
    >
      <div className="tape w-16 h-6 -top-3 left-10 rotate-12 opacity-50"></div>
      <h2 className="text-3xl font-semibold flex items-center gap-3 mb-8 italic tracking-tighter underline decoration-double">
        <Trophy className="text-warning-text" size={28} /> Top Sketchers
      </h2>
      <div className="space-y-4">
        {leaderboard.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center justify-between border-b-2 border-black/5 pb-2 hover:bg-black/5 transition-colors px-2"
          >
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs font-bold bg-ink-black text-surface px-2 py-0.5">
                0{index + 1}
              </span>
              <Link
                className="font-bold text-xl hover:underline italic tracking-tight"
                to={`/profile/${player.id}`}
              >
                {player.username}
              </Link>
            </div>
            <div className="text-right">
              <span className="font-mono text-sm font-bold">
                {player.elo} <span className="opacity-40 text-[10px] uppercase">pts</span>
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link
          className="text-xs font-bold uppercase underline opacity-40 hover:opacity-100 transition-opacity"
          to="/leaderboard"
        >
          View Full Index
        </Link>
      </div>
    </section>
  );
}

function StatsPanel({ userData }: { userData: UserDTO | null }) {
  return (
    <section
      aria-labelledby="dashboard-tab-stats"
      className="rough-border bg-white p-8 shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full"
      id="dashboard-panel-stats"
      role="tabpanel"
    >
      <div className="absolute -top-10 -right-10 size-32 bg-black/5 blur-3xl"></div>
      <h2 className="text-3xl font-semibold flex items-center gap-3 mb-8 italic tracking-tight">
        <UserIcon size={28} /> Your Stats
      </h2>
      <div className="space-y-6 relative z-10">
        <div className="flex justify-between items-end border-b border-black/10 pb-2">
          <span className="opacity-50 font-bold uppercase text-[10px] tracking-widest">ELO PERFORMANCE</span>
          <span className="font-bold text-3xl italic">{userData?.elo}</span>
        </div>
        <div className="flex justify-between items-end border-b border-black/10 pb-2">
          <span className="opacity-50 font-bold uppercase text-[10px] tracking-widest">VICTORIES</span>
          <span className="font-bold text-3xl italic text-success-text">{userData?.stats.wins ?? 0}</span>
        </div>
        <div className="aspect-square rough-border mt-8 flex flex-col items-center justify-center p-6 bg-paper relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,black_1px,transparent_1px)] bg-size-[10px_10px]"></div>
          <div className="text-4xl mb-4 opacity-20">🎭</div>
          <p className="italic opacity-30 text-center font-bold uppercase text-[10px] tracking-[0.2em] relative z-10 leading-relaxed">
            Avatar customization coming soon.
          </p>
        </div>
      </div>
    </section>
  );
}

const DashboardPage = ({ initialTab = 'lobby' }: DashboardPageProps) => {
  const navigate = useNavigate();
  const { user, userData, refreshUser } = useAuth();
  const { error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [activeMatches, setActiveMatches] = useState<MatchDTO[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUserDTO[]>([]);
  const leaderboardLoadedRef = useRef(false);
  const [draftState, dispatchDraft] = useReducer(
    dashboardDraftReducer,
    undefined,
    createInitialDashboardDraftState,
  );
  const {
    wager,
    isDrafting,
    isCreatingMatch,
    draftStep,
    draftType,
  } = draftState;
  const creatingMatchRef = useRef(false);
  const activeMatchesRequestRef = useRef(0);

  const refreshActiveMatches = useEffectEvent(async (signal?: AbortSignal) => {
    const requestId = activeMatchesRequestRef.current + 1;
    activeMatchesRequestRef.current = requestId;

    try {
      const matches = await getActiveMatches(signal);

      if (activeMatchesRequestRef.current === requestId && !signal?.aborted) {
        setActiveMatches(matches);
      }
    } catch (error) {
      if (activeMatchesRequestRef.current === requestId && !isAbortError(error, signal)) {
        showError('Failed to fetch active matches.');
      }
    }
  });

  const refreshLeaderboard = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const leaderboardEntries = await getLeaderboard(signal);

      if (!signal?.aborted) {
        setLeaderboard(leaderboardEntries);
      }
      return true;
    } catch (error) {
      if (!isAbortError(error, signal)) {
        showError('Failed to fetch leaderboard.');
      }
      return false;
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    void refreshActiveMatches(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'leaderboard' || leaderboardLoadedRef.current) {
      return undefined;
    }

    const controller = new AbortController();
    void refreshLeaderboard(controller.signal).then((loaded) => {
      if (loaded && !controller.signal.aborted) {
        leaderboardLoadedRef.current = true;
      }
    });

    return () => {
      controller.abort();
    };
  }, [activeTab]);

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    let hasConnectedOnce = false;
    const socket = createGameSocket();

    const refetchActiveMatches = () => {
      void refreshActiveMatches();
    };

    const handleConnect = () => {
      if (hasConnectedOnce && !socket.recovered) {
        void refreshActiveMatches();
      }

      hasConnectedOnce = true;
    };

    socket.on('connect', handleConnect);
    socket.on(PUBLIC_MATCHES_UPDATED_EVENT, refetchActiveMatches);

    return () => {
      socket.off('connect', handleConnect);
      socket.off(PUBLIC_MATCHES_UPDATED_EVENT, refetchActiveMatches);
      socket.disconnect();
    };
  }, [user?.id]);

  const createGameHandler = async () => {
    if (!user || !draftType) return;

    let normalizedWager = '0.000000';
    let isPrivate = false;

    if (draftType === 'private') {
      isPrivate = true;
      try {
        normalizedWager = normalizeFixedScaleAmount(wager, {
          scale: 6,
          label: 'Wager amount',
        });
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Invalid wager amount.');
        return;
      }
    } else if (draftType === 'paid_public') {
      try {
        normalizedWager = normalizeFixedScaleAmount(wager, {
          scale: 6,
          allowZero: false,
          label: 'Paid public wager',
        });
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Paid public wager must be greater than 0.');
        return;
      }
    }

    if (creatingMatchRef.current) {
      return;
    }

    creatingMatchRef.current = true;
    dispatchDraft({ type: 'CREATE_STARTED' });
    try {
      const match = await createMatch({ wager: normalizedWager, isPrivate });
      if (normalizedWager !== '0.000000') {
        await refreshUser();
      }
      navigate(match.inviteUrl ?? `/game/${match.roomId}`);
    } catch (error) {
      showError(getApiErrorMessage(error, 'Could not create match. Please try again.'));
    } finally {
      creatingMatchRef.current = false;
      dispatchDraft({ type: 'CREATE_FAILED' });
    }
  };

  const resetDraft = () => {
    dispatchDraft({ type: 'DRAFT_RESET' });
  };

  const freeMatches = activeMatches.filter((m) => moneyToNumber(m.wager) === 0);
  const paidMatches = activeMatches.filter((m) => moneyToNumber(m.wager) > 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'lobby' ? (
          <LobbyPanel
            draftStep={draftStep}
            draftType={draftType}
            freeMatches={freeMatches}
            isCreatingMatch={isCreatingMatch}
            isDrafting={isDrafting}
            onBackDraft={() => dispatchDraft({ type: 'DRAFT_STEP_CHANGED', draftStep: 1 })}
            onCancelDraft={resetDraft}
            onCreateMatch={() => {
              if (!isCreatingMatch) {
                void createGameHandler();
              }
            }}
            onJoinMatch={(roomId) => navigate(`/game/${roomId}`)}
            onNextDraftStep={() => {
              if (draftType === 'free_public') {
                void createGameHandler();
              } else {
                dispatchDraft({ type: 'DRAFT_STEP_CHANGED', draftStep: 2 });
              }
            }}
            onOpenDraft={() => dispatchDraft({ type: 'DRAFT_OPENED' })}
            onSelectDraftType={(nextDraftType) => dispatchDraft({ type: 'DRAFT_TYPE_SELECTED', draftType: nextDraftType })}
            onWagerChange={(nextWager) => dispatchDraft({ type: 'WAGER_CHANGED', wager: nextWager })}
            paidMatches={paidMatches}
            userBalance={userData?.balance}
            wager={wager}
          />
        ) : null}

        {activeTab === 'archives' ? <ArchivesPanel /> : null}

        {activeTab === 'leaderboard' ? <LeaderboardPanel leaderboard={leaderboard} /> : null}

        {activeTab === 'stats' ? <StatsPanel userData={userData} /> : null}
      </div>
    </div>
  );
};

export default DashboardPage;
