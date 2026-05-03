import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Medal } from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { getUserMatches } from '../services/matches.service';
import { getUserProfile } from '../services/users.service';
import { isAbortError } from '../utils/isAbortError';
import { cn } from '../utils/cn';
import type { MatchDTO, UserProfileDTO } from '../types/api';

const MINI_BOARD_SLOTS = Array.from({ length: 14 }, (_, index) => index);

const ProfilePage = () => {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const { error: showError } = useToast();
  const [profile, setProfile] = useState<UserProfileDTO | null>(null);
  const [history, setHistory] = useState<MatchDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setProfile(null);
    setHistory([]);

    const controller = new AbortController();

    const fetchProfileData = async () => {
      try {
        const [profileData, historyData] = await Promise.all([
          getUserProfile(userId, controller.signal),
          getUserMatches(userId, controller.signal),
        ]);

        setProfile(profileData);
        setHistory(historyData);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        showError('Failed to fetch profile details.');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfileData();

    return () => {
      controller.abort();
    };
  }, [showError, userId]);

  if (loading) {
    return <div className="text-center py-20 animate-pulse font-bold">Sharpening pencils...</div>;
  }

  if (!profile) {
    return <div className="text-center py-20 font-bold">Profile not found in the scribbles.</div>;
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link className="inline-flex items-center gap-2 font-bold hover:underline mb-4" to="/play">
        <ArrowLeft size={18} /> Back to Lobby
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="rough-border bg-white text-center py-10 relative shadow-lg">
            <div className="absolute -top-3 -left-3 text-3xl z-10 drop-shadow-md">📎</div>
            <div className="w-32 h-32 mx-auto sketchy-border rounded-full flex items-center justify-center bg-black/5 mb-6 overflow-hidden relative">
              <div className="tape w-12 h-4 -top-1 left-1/2 -ml-6 z-20"></div>
              <svg viewBox="0 0 100 100" className="w-20 h-20 opacity-30">
                <circle
                  cx="50"
                  cy="50"
                  fill="none"
                  r="40"
                  stroke="black"
                  strokeDasharray="5,5"
                  strokeWidth="2"
                />
                <circle cx="35" cy="40" fill="black" r="3" />
                <circle cx="65" cy="40" fill="black" r="3" />
                <path d="M 30 70 Q 50 85 70 70" fill="none" stroke="black" strokeWidth="2" />
              </svg>
            </div>
            <div className="relative inline-block px-4">
              <h1 className="text-3xl font-bold italic mb-1 relative z-10">{profile.username}</h1>
              <div className="highlighter w-full bottom-2 left-0 h-4"></div>
            </div>
            <p className="font-mono text-xs opacity-40 uppercase mb-8 font-bold tracking-widest">
              {userId?.substring(0, 10)}
            </p>

            <div className="flex justify-center gap-6 mb-8 px-4">
              <div className="text-center relative">
                <p className="text-[10px] uppercase font-bold opacity-40 tracking-tighter mb-1">ELO RATING</p>
                <p className="text-3xl font-bold italic">{profile.elo}</p>
                <div className="absolute -bottom-1 left-0 w-full h-1 bg-black/5 rounded"></div>
              </div>
              <div className="w-px h-12 bg-black/10"></div>
              <div className="text-center">
                <p className="text-[10px] uppercase font-bold opacity-40 tracking-tighter mb-1">
                  RECORD (W-L-D)
                </p>
                <p className="text-3xl font-bold italic">
                  {profile.stats?.wins || 0}-{profile.stats?.losses || 0}-{profile.stats?.draws || 0}
                </p>
                <div className="absolute -bottom-1 left-0 w-full h-1 bg-black/5 rounded"></div>
              </div>
            </div>

            {isOwnProfile && (
              <div className="px-6">
                <SketchyButton className="w-full text-sm uppercase font-bold" disabled>
                  Avatar Editing Coming Soon
                </SketchyButton>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 space-y-8">
          <div className="rough-border bg-white/80 p-8 shadow-xl relative">
            <div className="tape w-20 h-6 -top-2 left-10 opacity-60"></div>
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-8 italic tracking-tighter underline">
              <Medal className="text-orange-700" size={28} /> Sketcher Portfolio
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {['First Strike', 'Bank Master', 'USDT Whale', 'Winstreak'].map((feature) => (
                <div
                  key={feature}
                  className="p-4 bg-white sketchy-border text-center grayscale opacity-20 hover:opacity-100 transition-all cursor-help relative group"
                >
                  <div className="w-12 h-12 mx-auto rounded-full bg-black/5 mb-3 flex items-center justify-center">
                    🏆
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-tight">{feature}</p>
                  <div className="hidden group-hover:block absolute top-full left-1/2 -ml-20 w-40 p-2 bg-black text-white text-[10px] rounded z-20 mt-2">
                    Condition not met in this timeline.
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rough-border bg-white p-8 shadow-xl relative">
            <div className="tape w-20 h-6 -top-2 right-10 opacity-60 rotate-3"></div>
            <h2 className="text-3xl font-bold flex items-center gap-2 mb-8 italic tracking-tighter underline">
              <Gamepad2 size={28} /> Board Mini-Sketches
            </h2>
            <div className="space-y-6">
              {history.length === 0 ? (
                <p className="italic opacity-30 py-12 text-center font-bold uppercase tracking-widest">
                  No ink logs found.
                </p>
              ) : (
                history.map((match) => (
                  <div
                    key={match._id ?? match.roomId}
                    className="p-6 bg-white sketchy-border flex items-center justify-between hover:bg-black/5 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-xl flex items-center gap-2 uppercase tracking-tighter">
                        {match.p1Username} <span className="opacity-20 text-sm">VS</span>{' '}
                        {match.p2Username || 'GHOST'}
                      </p>
                      <p className="text-[10px] opacity-40 font-mono font-bold italic uppercase mt-1">
                        Outcome:{' '}
                        <span className={match.winnerId === userId ? 'text-green-600' : 'text-red-600'}>
                          {match.winnerId === userId
                            ? 'VICTORY'
                            : match.winnerId === 'draw'
                              ? 'DRAW'
                              : 'DEFEAT'}
                        </span>
                      </p>
                    </div>
                    <div className="sketch-grid w-20 h-16 p-1 bg-black/5 border-2 border-black/10">
                      {MINI_BOARD_SLOTS.map((slot) => (
                        <div
                          key={slot}
                          className={cn(
                            'slot w-2 h-2',
                            match.moveHistory?.[slot] && (slot % 2 === 0 ? 'disc-red border-0' : 'disc-blue border-0'),
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
