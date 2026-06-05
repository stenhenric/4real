import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Gamepad2,
  LoaderCircle,
  LockKeyhole,
  Medal,
  Palette,
  SearchX,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { EmptyState } from '../components/ui/EmptyState';
import { MiniMatchCard } from '../components/ui/MiniMatchCard';
import { StatePanel } from '../components/ui/StatePanel';
import { ProfileAvatar } from '../features/profile/ProfileAvatar';
import {
  PROFILE_MATCH_FILTERS,
  calculateProfileStats,
  getProfileAchievements,
  getVisibleProfileMatches,
  type ProfileMatchFilter,
} from '../features/profile/profilePresentation';
import { getUserMatches } from '../services/matches.service';
import { getUserProfile, updateAvatarSettings } from '../services/users.service';
import { AVATAR_COLORS, AVATAR_PRESETS, type AvatarSettingsDTO, type MatchDTO, type UserProfileDTO } from '../types/api';
import { getApiErrorMessage } from '../utils/errors';
import { isAbortError } from '../utils/isAbortError';

interface ProfilePageState {
  history: MatchDTO[];
  loading: boolean;
  profile: UserProfileDTO | null;
}

const FALLBACK_AVATAR: AvatarSettingsDTO = {
  preset: 'pencil-face-01',
  color: 'ink',
};

const COLOR_LABELS: Record<AvatarSettingsDTO['color'], string> = {
  ink: 'Ink',
  blue: 'Blue',
  teal: 'Teal',
  yellow: 'Yellow',
  rose: 'Rose',
  violet: 'Violet',
};

const COLOR_SWATCHES: Record<AvatarSettingsDTO['color'], string> = {
  ink: '#111827',
  blue: '#2563eb',
  teal: '#0f766e',
  yellow: '#d97706',
  rose: '#e11d48',
  violet: '#7c3aed',
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 text-center">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-normal opacity-45">{label}</p>
      <p className="truncate text-2xl font-bold italic sm:text-3xl">{value}</p>
    </div>
  );
}

const ProfilePage = () => {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const { error: showError, success: showSuccess } = useToast();
  const [{ history, loading, profile }, setProfileState] = useState<ProfilePageState>({
    history: [],
    loading: true,
    profile: null,
  });
  const [draftAvatar, setDraftAvatar] = useState<AvatarSettingsDTO>(FALLBACK_AVATAR);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<ProfileMatchFilter>('all');

  useEffect(() => {
    if (!userId) {
      setProfileState({
        history: [],
        loading: false,
        profile: null,
      });
      setDraftAvatar(FALLBACK_AVATAR);
      setSelectedFilter('all');
      return undefined;
    }

    setProfileState({
      history: [],
      loading: true,
      profile: null,
    });
    setSelectedFilter('all');

    const controller = new AbortController();

    const fetchProfileData = async () => {
      try {
        const [profileData, historyData] = await Promise.all([
          getUserProfile(userId, controller.signal),
          getUserMatches(userId, controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setProfileState({
            history: historyData,
            loading: false,
            profile: profileData,
          });
          setDraftAvatar(profileData.avatar ?? FALLBACK_AVATAR);
        }
      } catch (error) {
        if (isAbortError(error, controller.signal)) {
          return;
        }

        showError('Failed to fetch profile details.');
        if (!controller.signal.aborted) {
          setProfileState({
            history: [],
            loading: false,
            profile: null,
          });
          setDraftAvatar(FALLBACK_AVATAR);
        }
      }
    };

    void fetchProfileData();

    return () => {
      controller.abort();
    };
  }, [showError, userId]);

  if (loading) {
    return (
      <StatePanel
        eyebrow="Loading profile"
        icon={LoaderCircle}
        iconClassName="animate-spin"
        title="Sharpening pencils..."
        tone="info"
      />
    );
  }

  if (!profile) {
    return (
      <StatePanel
        eyebrow="Profile"
        icon={SearchX}
        title="Profile not found"
        tone="warning"
      >
        This player was not found in the scribbles.
      </StatePanel>
    );
  }

  const isOwnProfile = currentUser?.id === userId;
  const activeAvatar = profile.avatar ?? FALLBACK_AVATAR;
  const avatarDirty = draftAvatar.preset !== activeAvatar.preset || draftAvatar.color !== activeAvatar.color;
  const statSummary = calculateProfileStats(profile);
  const achievements = getProfileAchievements({ profile, history, userId: userId ?? profile.id });
  const visibleMatches = getVisibleProfileMatches(history, userId ?? profile.id, selectedFilter);

  const achievementCounts = `${achievements.filter((achievement) => achievement.unlocked).length}/${achievements.length}`;

  const saveAvatar = async () => {
    if (!avatarDirty || savingAvatar) {
      return;
    }

    setSavingAvatar(true);
    try {
      const updatedProfile = await updateAvatarSettings(draftAvatar);
      setProfileState((current) => ({
        ...current,
        profile: updatedProfile,
      }));
      setDraftAvatar(updatedProfile.avatar);
      showSuccess('Avatar saved.');
    } catch (error) {
      showError(getApiErrorMessage(error, 'Could not save avatar. Please try again.'));
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 mobile-bottom-safe md:pb-0">
      <Link className="mb-4 inline-flex items-center gap-2 font-bold hover:underline" to="/play">
        <ArrowLeft size={18} /> Back to Lobby
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rough-border relative bg-white px-5 py-8 text-center shadow-lg">
            <div className="tape -top-2 left-1/2 h-5 w-20 -translate-x-1/2 opacity-70" />
            <div className="mx-auto mb-6 flex size-32 items-center justify-center overflow-hidden sketchy-border bg-black/5 p-2">
              <ProfileAvatar avatar={activeAvatar} label={`${profile.username} avatar`} />
            </div>
            <div className="relative inline-block px-4">
              <h1 className="relative z-10 mb-1 text-3xl font-semibold italic">{profile.username}</h1>
              <div className="highlighter bottom-2 left-0 h-4 w-full" />
            </div>
            <p className="mb-7 font-mono text-xs font-bold uppercase tracking-widest opacity-45">
              {profile.id.substring(0, 10)}
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <StatTile label="ELO" value={profile.elo} />
              <StatTile label="Record" value={statSummary.recordLabel} />
              <StatTile label="Win Rate" value={statSummary.winRateLabel} />
              <StatTile label="Matches" value={statSummary.totalMatches} />
            </div>
          </section>

          {isOwnProfile ? (
            <section className="rough-border relative bg-white/90 p-5 shadow-lg">
              <div className="mb-4 flex items-center gap-2">
                <Palette size={20} />
                <h2 className="text-xl font-bold italic tracking-tighter">Avatar</h2>
              </div>

              <div className="grid grid-cols-3 gap-2" aria-label="Avatar preset">
                {AVATAR_PRESETS.map((preset, index) => {
                  const selected = draftAvatar.preset === preset;
                  const avatar = { ...draftAvatar, preset };

                  return (
                    <SketchyButton
                      key={preset}
                      aria-label={`Avatar preset ${index + 1}`}
                      aria-pressed={selected}
                      className={`aspect-square bg-white p-1 transition-transform hover:-rotate-1 ${selected ? 'ring-2 ring-ink-blue' : ''}`}
                      onClick={() => setDraftAvatar((current) => ({ ...current, preset }))}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ProfileAvatar avatar={avatar} label={`Avatar preset ${index + 1} preview`} />
                    </SketchyButton>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-6 gap-2" aria-label="Avatar color">
                {AVATAR_COLORS.map((color) => (
                  <SketchyButton
                    key={color}
                    aria-label={COLOR_LABELS[color]}
                    aria-pressed={draftAvatar.color === color}
                    className={`aspect-square transition-transform hover:-rotate-2 ${draftAvatar.color === color ? 'ring-2 ring-ink-blue' : ''}`}
                    onClick={() => setDraftAvatar((current) => ({ ...current, color }))}
                    size="icon"
                    style={{ backgroundColor: COLOR_SWATCHES[color] }}
                    title={COLOR_LABELS[color]}
                    type="button"
                    variant="ghost"
                  />
                ))}
              </div>

              <SketchyButton
                className="mt-4 w-full text-sm uppercase"
                disabled={!avatarDirty || savingAvatar}
                onClick={saveAvatar}
                variant="primary"
              >
                {savingAvatar ? 'Saving...' : avatarDirty ? 'Save avatar' : 'Avatar saved'}
              </SketchyButton>
            </section>
          ) : null}
        </aside>

        <main className="space-y-8">
          <section className="rough-border relative bg-white/80 p-6 shadow-xl sm:p-8">
            <div className="tape -top-2 left-10 h-6 w-20 opacity-60" />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-3xl font-semibold italic tracking-tighter underline">
                <Medal className="text-warning-text" size={28} /> Sketcher Portfolio
              </h2>
              <span className="font-mono text-xs font-bold uppercase opacity-55">{achievementCounts} unlocked</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {achievements.map((achievement) => {
                const Icon = achievement.unlocked ? CheckCircle2 : LockKeyhole;
                return (
                  <article
                    key={achievement.id}
                    className={`sketch-card min-h-32 p-4 ${achievement.unlocked ? 'bg-success-bg/60' : 'bg-white opacity-75'}`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div
                        aria-hidden="true"
                        className={`flex size-10 items-center justify-center sketchy-border ${achievement.unlocked ? 'bg-success-bg text-success-text' : 'bg-black/5 text-ink-black/50'}`}
                      >
                        {achievement.unlocked ? <Trophy size={20} /> : <LockKeyhole size={18} />}
                      </div>
                      <Icon
                        aria-hidden="true"
                        className={achievement.unlocked ? 'text-success-text' : 'text-ink-black/40'}
                        size={18}
                      />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-normal">{achievement.label}</h3>
                    <p className="mt-2 text-xs font-mono font-bold uppercase leading-relaxed opacity-60">
                      {achievement.requirement}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rough-border relative bg-white p-6 shadow-xl sm:p-8">
            <div className="tape -top-2 right-10 h-6 w-20 rotate-3 opacity-60" />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-3xl font-semibold italic tracking-tighter underline">
                <Gamepad2 size={28} /> Match History
              </h2>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Match history filter">
                {PROFILE_MATCH_FILTERS.map((filter) => (
                  <SketchyButton
                    key={filter.id}
                    aria-selected={selectedFilter === filter.id}
                    className="text-xs uppercase transition-transform hover:-rotate-1"
                    fill={selectedFilter === filter.id ? 'var(--color-note-yellow)' : 'white'}
                    onClick={() => setSelectedFilter(filter.id)}
                    role="tab"
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {filter.label}
                  </SketchyButton>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {visibleMatches.length === 0 ? (
                <EmptyState>
                  {history.length === 0
                    ? isOwnProfile
                      ? <Link className="font-bold text-ink-blue underline" to="/play">No matches yet. Enter the lobby.</Link>
                      : 'No public matches yet.'
                    : 'No matches in this filter.'}
                </EmptyState>
              ) : (
                visibleMatches.map((match) => (
                  <MiniMatchCard key={match._id ?? match.roomId} currentUserId={userId} match={match} />
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default ProfilePage;
