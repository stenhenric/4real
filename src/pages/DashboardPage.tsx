import { useEffect, useEffectEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Play, Plus, Trophy, User as UserIcon } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { createMatch, getActiveMatches } from '../services/matches.service';
import { getLeaderboard } from '../services/users.service';
import { createGameSocket } from '../sockets/gameSocket';
import { PUBLIC_MATCHES_UPDATED_EVENT } from '../../shared/socket-events';
import { isAbortError } from '../utils/isAbortError';
import type { LeaderboardUserDTO, MatchDTO } from '../types/api';

type DashboardTab = 'lobby' | 'leaderboard' | 'archives' | 'stats';

interface DashboardPageProps {
  initialTab?: DashboardTab;
}

const DashboardPage = ({ initialTab = 'lobby' }: DashboardPageProps) => {
  const navigate = useNavigate();
  const { user, userData, refreshUser } = useAuth();
  const { error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [activeMatches, setActiveMatches] = useState<MatchDTO[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUserDTO[]>([]);
  const [wager, setWager] = useState('0');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftStep, setDraftStep] = useState<1 | 2>(1);
  const [draftType, setDraftType] = useState<'private' | 'free_public' | 'paid_public' | null>(null);

  const refreshActiveMatches = useEffectEvent(async (signal?: AbortSignal) => {
    try {
      const matches = await getActiveMatches(signal);

      if (!signal?.aborted) {
        setActiveMatches(matches);
      }
    } catch (error) {
      if (!isAbortError(error)) {
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
    } catch (error) {
      if (!isAbortError(error)) {
        showError('Failed to fetch leaderboard.');
      }
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      refreshActiveMatches(controller.signal),
      refreshLeaderboard(controller.signal),
    ]);

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!user) {
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

    let parsedWager = 0;
    let isPrivate = false;

    if (draftType === 'private') {
      isPrivate = true;
      parsedWager = parseFloat(wager);
    } else if (draftType === 'paid_public') {
      parsedWager = parseFloat(wager);
    }

    if ((draftType === 'private' || draftType === 'paid_public') && (Number.isNaN(parsedWager) || parsedWager < 0)) {
      showError('Invalid wager amount.');
      return;
    }

    try {
      const match = await createMatch({ wager: parsedWager, isPrivate });
      if (parsedWager > 0) {
        await refreshUser();
      }
      navigate(match.inviteUrl ?? `/game/${match.roomId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Match creation failed. Please try again.';
      if (message.toLowerCase().includes('insufficient balance')) {
        showError('Insufficient balance to lock wager.');
      } else {
        showError(message);
      }
    }
  };

  const resetDraft = () => {
    setIsDrafting(false);
    setDraftType(null);
    setDraftStep(1);
    setWager('0');
  };

  const freeMatches = activeMatches.filter((m) => m.wager === 0);
  const paidMatches = activeMatches.filter((m) => m.wager > 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div
        aria-label="Dashboard sections"
        className="flex flex-wrap gap-4 border-b-4 border-black/10 pb-4 mb-8 sticky top-0 bg-paper z-20 py-4"
        role="tablist"
      >
        <SketchyButton
          activeColor="#fff9c4"
          aria-controls="dashboard-panel-lobby"
          aria-selected={activeTab === 'lobby'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'lobby' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
          fill={activeTab === 'lobby' ? '#fff9c4' : 'transparent'}
          id="dashboard-tab-lobby"
          onClick={() => setActiveTab('lobby')}
          role="tab"
        >
          <Play size={20} /> Lobby
        </SketchyButton>
        <SketchyButton
          activeColor="#fff9c4"
          aria-controls="dashboard-panel-leaderboard"
          aria-selected={activeTab === 'leaderboard'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'leaderboard' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
          fill={activeTab === 'leaderboard' ? '#fff9c4' : 'transparent'}
          id="dashboard-tab-leaderboard"
          onClick={() => setActiveTab('leaderboard')}
          role="tab"
        >
          <Trophy size={20} /> Leaderboard
        </SketchyButton>
        <SketchyButton
          activeColor="#fff9c4"
          aria-controls="dashboard-panel-archives"
          aria-selected={activeTab === 'archives'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'archives' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
          fill={activeTab === 'archives' ? '#fff9c4' : 'transparent'}
          id="dashboard-tab-archives"
          onClick={() => setActiveTab('archives')}
          role="tab"
        >
          <Clock size={20} /> Archives
        </SketchyButton>
        <SketchyButton
          activeColor="#fff9c4"
          aria-controls="dashboard-panel-stats"
          aria-selected={activeTab === 'stats'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'stats' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
          fill={activeTab === 'stats' ? '#fff9c4' : 'transparent'}
          id="dashboard-tab-stats"
          onClick={() => setActiveTab('stats')}
          role="tab"
        >
          <UserIcon size={20} /> Stats
        </SketchyButton>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'lobby' && (
          <section
            aria-labelledby="dashboard-tab-lobby"
            className="rough-border bg-white p-8 relative shadow-xl overflow-hidden max-w-4xl mx-auto w-full"
            id="dashboard-panel-lobby"
            role="tabpanel"
          >
            <div className="tape w-24 h-6 -top-2 left-1/2 -ml-12 rotate-1"></div>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 relative z-10 gap-6">
              <div className="relative inline-block">
                <h2 className="text-4xl font-bold flex items-center gap-3 italic tracking-tighter underline decoration-wavy">
                  <Play className="fill-ink-black" size={32} /> Central Lobby
                </h2>
                <div className="highlighter w-full bottom-2 left-0 h-4 scale-x-110"></div>
              </div>
              <div className="flex flex-col items-end gap-2 text-right w-full md:w-auto">
                {!isDrafting && (
                  <SketchyButton
                    className="flex items-center gap-2 text-xl px-10 w-full md:w-auto justify-center"
                    onClick={() => setIsDrafting(true)}
                  >
                    <Plus size={24} /> New Draft
                  </SketchyButton>
                )}
              </div>
            </div>

            {isDrafting && (
              <div className="mb-8 p-6 bg-paper rough-border relative z-10 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="tape w-16 h-6 -top-2 left-4 -rotate-2 opacity-60"></div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold italic tracking-tight underline decoration-wavy">Draft Creation</h3>
                  <button onClick={resetDraft} className="text-sm font-bold uppercase opacity-50 hover:opacity-100">Cancel</button>
                </div>
                
                {draftStep === 1 && (
                  <div className="space-y-4">
                    <p className="font-bold uppercase opacity-50 text-sm mb-4">Step 1: Select Match Type</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div onClick={() => setDraftType('private')} className="cursor-pointer h-full">
                        <SketchyButton 
                          fill={draftType === 'private' ? '#fff9c4' : 'transparent'}
                          className="flex flex-col items-center justify-center p-4 h-full w-full pointer-events-none"
                        >
                          <span className="font-bold text-lg mb-2">Private Match</span>
                          <span className="text-xs opacity-60 text-center">Hidden from lobby. Invite code required.</span>
                        </SketchyButton>
                      </div>
                      <div onClick={() => setDraftType('free_public')} className="cursor-pointer h-full">
                        <SketchyButton 
                          fill={draftType === 'free_public' ? '#fff9c4' : 'transparent'}
                          className="flex flex-col items-center justify-center p-4 h-full w-full pointer-events-none"
                        >
                          <span className="font-bold text-lg mb-2">Free Public</span>
                          <span className="text-xs opacity-60 text-center">Visible in Free lobby. No wager.</span>
                        </SketchyButton>
                      </div>
                      <div onClick={() => setDraftType('paid_public')} className="cursor-pointer h-full">
                        <SketchyButton 
                          fill={draftType === 'paid_public' ? '#fff9c4' : 'transparent'}
                          className="flex flex-col items-center justify-center p-4 h-full w-full pointer-events-none"
                        >
                          <span className="font-bold text-lg mb-2">Paid Public</span>
                          <span className="text-xs opacity-60 text-center">Visible in Paid lobby. Wager required.</span>
                        </SketchyButton>
                      </div>
                    </div>
                    
                    <div className="flex justify-end mt-6">
                      <div onClick={() => {
                        if (draftType) {
                          if (draftType === 'free_public') {
                            void createGameHandler();
                          } else {
                            setDraftStep(2);
                          }
                        }
                      }} className={!draftType ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}>
                        <SketchyButton className="px-8 pointer-events-none">
                          {draftType === 'free_public' ? 'Create Match' : 'Next Step'}
                        </SketchyButton>
                      </div>
                    </div>
                  </div>
                )}
                
                {draftStep === 2 && (
                  <div className="space-y-4">
                    <p className="font-bold uppercase opacity-50 text-sm mb-4">Step 2: Set Wager</p>
                    <div className="flex flex-col items-start">
                      <label className="font-bold text-lg mb-2" htmlFor="draft-wager">
                        Wager Amount (USDT)
                      </label>
                      <input
                        className="w-full max-w-xs bg-transparent border-b-4 border-black font-bold text-2xl outline-none p-2 focus:bg-white/50 transition-colors"
                        id="draft-wager"
                        onChange={(event) => setWager(event.target.value)}
                        type="number"
                        value={wager}
                        min="0"
                        step="0.1"
                        autoFocus
                      />
                      <p className="text-xs opacity-50 mt-2 font-bold uppercase">Available balance: {userData?.balance ?? 0} USDT</p>
                    </div>
                    
                    <div className="flex justify-between mt-6">
                      <div onClick={() => setDraftStep(1)} className="cursor-pointer">
                        <SketchyButton className="pointer-events-none">Back</SketchyButton>
                      </div>
                      <div onClick={() => void createGameHandler()} className="cursor-pointer">
                        <SketchyButton className="bg-black/5 pointer-events-none">Create Match</SketchyButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isDrafting && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 mt-12">
                {/* Free Matches Column */}
                <div>
                  <h3 className="font-bold text-xl uppercase tracking-tighter mb-4 opacity-50 flex items-center gap-2">
                    Free Public <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full">{freeMatches.length}</span>
                  </h3>
                  <div className="space-y-4">
                    {freeMatches.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-black/10 rounded-xl">
                        <p className="italic opacity-30 font-bold text-sm uppercase tracking-widest">No free drafts...</p>
                      </div>
                    ) : (
                      freeMatches.map((match) => (
                        <div
                          key={match._id ?? match.roomId}
                          className="group relative p-5 bg-white rough-border hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                        >
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-20">
                            <Clock size={10} /> <span className="text-[9px] font-mono">LIVE</span>
                          </div>
                          <div className="mb-3">
                            <h4 className="font-bold text-lg uppercase tracking-tight">{match.p1Username}</h4>
                            <p className="text-[10px] font-mono opacity-40 font-bold">
                              NODE: {match.roomId.toUpperCase()}
                            </p>
                          </div>
                          <SketchyButton className="w-full text-sm py-2" onClick={() => navigate(`/game/${match.roomId}`)}>
                            Join for Free
                          </SketchyButton>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Paid Matches Column */}
                <div>
                  <h3 className="font-bold text-xl uppercase tracking-tighter mb-4 flex items-center gap-2 text-amber-600">
                    Paid Public <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded-full">{paidMatches.length}</span>
                  </h3>
                  <div className="space-y-4">
                    {paidMatches.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-black/10 rounded-xl">
                        <p className="italic opacity-30 font-bold text-sm uppercase tracking-widest">No paid drafts...</p>
                      </div>
                    ) : (
                      paidMatches.map((match) => (
                        <div
                          key={match._id ?? match.roomId}
                          className="group relative p-5 bg-white rough-border border-amber-500/30 hover:border-amber-500 hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                        >
                          <div className="absolute -left-2 -top-2 bg-amber-400 text-black font-bold text-[10px] px-2 py-1 rotate-[-5deg] rough-border shadow-sm z-10">
                            {match.wager} USDT
                          </div>
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-20">
                            <Clock size={10} /> <span className="text-[9px] font-mono">LIVE</span>
                          </div>
                          <div className="mb-3 mt-2">
                            <h4 className="font-bold text-lg uppercase tracking-tight">{match.p1Username}</h4>
                            <p className="text-[10px] font-mono opacity-40 font-bold">
                              NODE: {match.roomId.toUpperCase()}
                            </p>
                          </div>
                          <SketchyButton className="w-full text-sm py-2 bg-amber-400/10" onClick={() => navigate(`/game/${match.roomId}`)}>
                            Join & Wager
                          </SketchyButton>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'archives' && (
          <section
            aria-labelledby="dashboard-tab-archives"
            className="rough-border bg-white/50 p-8 shadow-inner relative max-w-4xl mx-auto w-full"
            id="dashboard-panel-archives"
            role="tabpanel"
          >
            <h2 className="text-3xl font-bold flex items-center gap-3 italic mb-8 opacity-40">
              <Clock size={28} /> Archives
            </h2>
            <div className="py-12 border-2 border-dashed border-black/5 rounded-xl text-center">
              <p className="italic opacity-20 font-bold uppercase tracking-widest text-sm">
                Historical records pending match completion...
              </p>
            </div>
          </section>
        )}

        {activeTab === 'leaderboard' && (
          <section
            aria-labelledby="dashboard-tab-leaderboard"
            className="sticky-note p-8 rough-border shadow-2xl relative max-w-2xl mx-auto w-full"
            id="dashboard-panel-leaderboard"
            role="tabpanel"
          >
            <div className="tape w-16 h-6 -top-3 left-10 rotate-12 opacity-50"></div>
            <h2 className="text-3xl font-bold flex items-center gap-3 mb-8 italic tracking-tighter underline decoration-double">
              <Trophy className="text-yellow-700" size={28} /> Top Sketchers
            </h2>
            <div className="space-y-4">
              {leaderboard.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between border-b-2 border-black/5 pb-2 hover:bg-black/5 transition-colors px-2"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs font-bold bg-black text-white px-2 py-0.5 rounded">
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
        )}

        {activeTab === 'stats' && (
          <section
            aria-labelledby="dashboard-tab-stats"
            className="rough-border bg-white p-8 shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full"
            id="dashboard-panel-stats"
            role="tabpanel"
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-black/5 rounded-full blur-3xl"></div>
            <h2 className="text-3xl font-bold flex items-center gap-3 mb-8 italic tracking-tight">
              <UserIcon size={28} /> Your Stats
            </h2>
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-end border-b border-black/10 pb-2">
                <span className="opacity-50 font-bold uppercase text-[10px] tracking-widest">ELO PERFORMANCE</span>
                <span className="font-bold text-3xl italic">{userData?.elo}</span>
              </div>
              <div className="flex justify-between items-end border-b border-black/10 pb-2">
                <span className="opacity-50 font-bold uppercase text-[10px] tracking-widest">VICTORIES</span>
                <span className="font-bold text-3xl italic text-green-700">{userData?.stats.wins ?? 0}</span>
              </div>
              <div className="aspect-square rough-border mt-8 flex flex-col items-center justify-center p-6 bg-paper relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,black_1px,transparent_1px)] bg-[size:10px_10px]"></div>
                <div className="text-4xl mb-4 opacity-20">🎭</div>
                <p className="italic opacity-30 text-center font-bold uppercase text-[10px] tracking-[0.2em] relative z-10 leading-relaxed">
                  Profile Avatar Rendering System OFFLINE
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
