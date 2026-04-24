import { useState, type FormEvent } from 'react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { SketchyButton } from '../components/SketchyButton';
import { SketchyContainer } from '../components/SketchyContainer';
import { login, register } from '../services/auth.service';

const AUTH_ERROR_ID = 'auth-error';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const { success, error: showError } = useToast();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login({ username, password });
        success('Welcome back!');
      } else {
        await register({ username, password });
        success('Account created! Welcome to the notebook.');
      }

      await refreshUser();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Authentication failed';

      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleModeToggle = () => {
    setIsLogin((currentValue) => !currentValue);
    setError('');
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <SketchyContainer fill="#fff" roughness={1}>
        <div className="text-center mb-6 relative">
          <div className="relative inline-block">
            <h1
              className="text-6xl font-bold italic mb-2 tracking-tighter"
              style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}
            >
              4real
            </h1>
            <div className="highlighter w-full bottom-4 left-0"></div>
          </div>
          <p className="opacity-70 italic mt-2">Hand-drawn competition starts here.</p>
        </div>

        <form aria-describedby={error ? AUTH_ERROR_ID : undefined} className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              className="block text-sm font-bold mb-1 ml-1 uppercase opacity-60"
              htmlFor="auth-username"
            >
              Username (Pseudonym)
            </label>
            <input
              aria-invalid={Boolean(error)}
              autoComplete="username"
              className="w-full border-b-2 border-black/20 focus:border-black p-2 text-xl font-bold"
              id="auth-username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="CoolSketcher42"
              required
              type="text"
              value={username}
            />
          </div>

          <div>
            <label
              className="block text-sm font-bold mb-1 ml-1 uppercase opacity-60"
              htmlFor="auth-password"
            >
              Password
            </label>
            <input
              aria-invalid={Boolean(error)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              className="w-full border-b-2 border-black/20 focus:border-black p-2 text-xl font-bold"
              id="auth-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>

          {error && (
            <p className="text-ink-red text-sm font-bold ml-1" id={AUTH_ERROR_ID} role="alert">
              Error: {error}
            </p>
          )}

          <SketchyButton activeColor="#fef3c7" className="w-full text-xl" disabled={loading} type="submit">
            {loading ? 'Processing...' : isLogin ? 'Enter Notebook' : 'Create Character'}
          </SketchyButton>
        </form>

        <div className="mt-8 text-center">
          <p className="opacity-60 italic mb-2">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </p>
          <button
            className="font-bold underline hover:no-underline"
            onClick={handleModeToggle}
            type="button"
          >
            {isLogin ? 'Register New Sketch' : 'Log into Existing Sketch'}
          </button>
        </div>
      </SketchyContainer>

      <div className="mt-12 text-center opacity-40 italic flex flex-col items-center">
        <span className="text-xs">Handcrafted for competitive players</span>
        <div className="w-12 h-px bg-black my-2"></div>
        <span className="text-xs">© 2026 4real Corp</span>
      </div>
    </div>
  );
};

export default AuthPage;
