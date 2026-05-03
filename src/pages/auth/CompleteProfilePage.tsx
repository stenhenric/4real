import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SketchyButton } from '../../components/SketchyButton';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { AuthField, AuthNotice, AuthShell } from '../../features/auth/AuthShell';
import { completeProfile } from '../../services/auth.service';

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const { userData, setAuthStateFromResponse } = useAuth();
  const { success, error: showError } = useToast();
  const [username, setUsername] = useState(userData?.username ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await completeProfile({ username });
      setAuthStateFromResponse(response);
      success('Profile completed.');
      navigate('/play', { replace: true });
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Unable to complete your profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Complete Profile"
      title="Choose the public name players will see."
      description="Google and magic-link accounts still need a gameplay identity before they can enter the lobby."
    >
      <div className="space-y-6">
        <AuthNotice tone="info">
          This username appears in lobbies, match history, and leaderboards. Your email stays private.
        </AuthNotice>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <AuthField
            autoComplete="username"
            hint="3 to 32 characters. Letters, numbers, and separators only."
            label="Public Username"
            maxLength={32}
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="connect4killer"
            required
            type="text"
            value={username}
          />

          <SketchyButton className="w-full py-3 text-base" disabled={loading} type="submit">
            {loading ? 'Saving profile...' : 'Continue to lobby'}
          </SketchyButton>
        </form>
      </div>
    </AuthShell>
  );
}
