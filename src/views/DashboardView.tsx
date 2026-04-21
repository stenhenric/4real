import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, limit, orderBy, onSnapshot, setDoc, doc, where, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { Trophy, Play, Plus, Clock, User as UserIcon } from 'lucide-react';

const DashboardView: React.FC = () => {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeMatches, setActiveMatches] = useState<any[]>([]);

  const [isPrivate, setIsPrivate] = useState(false);
  const [wager, setWager] = useState('0');

  // Tab State
  const [activeTab, setActiveTab] = useState<'lobby' | 'archives' | 'leaderboard' | 'stats'>('lobby');

  useEffect(() => {
    // Leaderboard
    const qLeaders = query(collection(db, 'users'), orderBy('elo', 'desc'), limit(5));
    const unsubLeaders = onSnapshot(qLeaders, (snap) => {
      setLeaderboard(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Active Matches (Waiting for players)
    const qMatches = query(
      collection(db, 'matches'),
      where('status', '==', 'waiting'),
      where('isPrivate', '==', false),
      limit(10)
    );
    const unsubMatches = onSnapshot(qMatches, (snap) => {
      setActiveMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubLeaders();
      unsubMatches();
    };
  }, []);

  const createGame = async () => {
    if (!user) {
      alert("You must be signed in to create a match.");
      return;
    }

    const amount = parseFloat(wager);
    if (isPrivate && (isNaN(amount) || amount < 0)) {
      alert("Please enter a valid wager amount.");
      return;
    }

    if (isPrivate && amount > (userData?.balance || 0)) {
      alert("Insufficient balance to lock wager.");
      return;
    }

    const matchRef = doc(collection(db, 'matches'));
    const roomId = matchRef.id;

    try {
      await runTransaction(db, async (transaction) => {
        if (isPrivate && amount > 0) {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);
          const currentBalance = Number(userSnap.data()?.balance ?? 0);

          if (currentBalance < amount) {
            throw new Error('INSUFFICIENT_BALANCE');
          }

          transaction.set(userRef, {
            balance: currentBalance - amount
          }, { merge: true });
        }

        transaction.set(matchRef, {
          roomId,
          player1Id: user.uid,
          p1Username: userData?.username,
          status: 'waiting',
          isPrivate,
          wager: isPrivate ? amount : 0,
          timestamp: new Date().toISOString()
        });
      });

      navigate(`/game/${roomId}`);
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
        alert("Insufficient balance to lock wager.");
        return;
      }
      console.error("Match creation failed:", error);
      alert("Match creation failed. Please try again.");
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-4 border-b-4 border-black/10 pb-4 mb-8 sticky top-0 bg-paper z-20 py-4">
        <SketchyButton
          onClick={() => setActiveTab('lobby')}
          activeColor="#fff9c4"
          fill={activeTab === 'lobby' ? '#fff9c4' : 'transparent'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'lobby' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
        >
          <Play size={20} /> Lobby
        </SketchyButton>
        <SketchyButton
          onClick={() => setActiveTab('leaderboard')}
          activeColor="#fff9c4"
          fill={activeTab === 'leaderboard' ? '#fff9c4' : 'transparent'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'leaderboard' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
        >
          <Trophy size={20} /> Leaderboard
        </SketchyButton>
        <SketchyButton
          onClick={() => setActiveTab('archives')}
          activeColor="#fff9c4"
          fill={activeTab === 'archives' ? '#fff9c4' : 'transparent'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'archives' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
        >
          <Clock size={20} /> Archives
        </SketchyButton>
        <SketchyButton
          onClick={() => setActiveTab('stats')}
          activeColor="#fff9c4"
          fill={activeTab === 'stats' ? '#fff9c4' : 'transparent'}
          className={`flex items-center gap-2 text-xl ${activeTab === 'stats' ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
        >
          <UserIcon size={20} /> Stats
        </SketchyButton>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'lobby' && (
          <div className="rough-border bg-white p-8 relative shadow-xl overflow-hidden max-w-4xl mx-auto w-full">
            <div className="tape w-24 h-6 -top-2 left-1/2 -ml-12 rotate-1"></div>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 relative z-10 gap-6">
              <div className="relative inline-block">
                <h2 className="text-4xl font-bold flex items-center gap-3 italic tracking-tighter underline decoration-wavy">
                  <Play className="fill-ink-black" size={32} /> Central Lobby
                </h2>
                <div className="highlighter w-full bottom-2 left-0 h-4 scale-x-110"></div>
              </div>
              <div className="flex flex-col items-end gap-2 text-right w-full md:w-auto">
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 mb-1">
                  {isPrivate && (
                    <div className="flex flex-col items-end">
                      <label className="text-[10px] font-bold uppercase opacity-50 underline">Wager (USDT)</label>
                      <input
                        type="number"
                        value={wager}
                        onChange={(e) => setWager(e.target.value)}
                        className="w-20 bg-transparent border-b-2 border-black font-bold text-sm text-right outline-none"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="private-toggle"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="w-4 h-4 accent-ink-black"
                    />
                    <label htmlFor="private-toggle" className="text-xs font-bold uppercase cursor-pointer">Private Match</label>
                  </div>
                </div>
                <SketchyButton onClick={createGame} className="flex items-center gap-2 text-xl px-10 w-full md:w-auto justify-center">
                  <Plus size={24} /> New Draft
                </SketchyButton>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              {activeMatches.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-black/10 rounded-xl">
                  <p className="italic opacity-30 font-bold text-lg uppercase tracking-[0.3em]">No active drafts in rotation...</p>
                  <div className="mt-4 text-4xl opacity-10">✍️</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeMatches.map(match => (
                    <div key={match.id} className="group relative p-6 bg-white rough-border hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-20">
                         <Clock size={12} /> <span className="text-[10px] font-mono">LIVE</span>
                      </div>
                      <div className="mb-4">
                        <h3 className="font-bold text-2xl uppercase tracking-tighter">{match.p1Username}</h3>
                        <p className="text-[10px] font-mono opacity-40 font-bold">NODE: {match.roomId.toUpperCase()}</p>
                      </div>
                      <SketchyButton onClick={() => navigate(`/game/${match.roomId}`)} className="w-full bg-black/5">
                        Join Match
                      </SketchyButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'archives' && (
          <div className="rough-border bg-white/50 p-8 shadow-inner relative max-w-4xl mx-auto w-full">
            <h2 className="text-3xl font-bold flex items-center gap-3 italic mb-8 opacity-40">
              <Clock size={28} /> Archives
            </h2>
            <div className="py-12 border-2 border-dashed border-black/5 rounded-xl text-center">
              <p className="italic opacity-20 font-bold uppercase tracking-widest text-sm">Historical records pending match completion...</p>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="sticky-note p-8 rough-border shadow-2xl relative max-w-2xl mx-auto w-full">
            <div className="tape w-16 h-6 -top-3 left-10 rotate-12 opacity-50"></div>
            <h2 className="text-3xl font-bold flex items-center gap-3 mb-8 italic tracking-tighter underline decoration-double">
              <Trophy className="text-yellow-700" size={28} /> Top Sketchers
            </h2>
            <div className="space-y-4">
              {leaderboard.map((player, i) => (
                <div key={player.id} className="flex items-center justify-between border-b-2 border-black/5 pb-2 hover:bg-black/5 transition-colors px-2">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs font-bold bg-black text-white px-2 py-0.5 rounded">0{i+1}</span>
                    <Link to={`/profile/${player.id}`} className="font-bold text-xl hover:underline italic tracking-tight">{player.username}</Link>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold">{player.elo} <span className="opacity-40 text-[10px] uppercase">pts</span></span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link to="/leaderboard" className="text-xs font-bold uppercase underline opacity-40 hover:opacity-100 transition-opacity">View Full Index</Link>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="rough-border bg-white p-8 shadow-xl relative overflow-hidden max-w-2xl mx-auto w-full">
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
                <span className="font-bold text-3xl italic text-green-700">0</span>
              </div>
              <div className="aspect-square rough-border mt-8 flex flex-col items-center justify-center p-6 bg-paper relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,black_1px,transparent_1px)] bg-[size:10px_10px]"></div>
                <div className="text-4xl mb-4 opacity-20">🎭</div>
                <p className="italic opacity-30 text-center font-bold uppercase text-[10px] tracking-[0.2em] relative z-10 leading-relaxed">
                  Profile Avatar Rendering System OFFLINE
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardView;
