import React, { useState } from 'react';
import request, { setToken } from '../lib/api/apiClient';
import { useAuth } from '../lib/AuthContext';
import { SketchyContainer } from '../components/SketchyContainer';
import { SketchyButton } from '../components/SketchyButton';
import { useToast } from '../lib/ToastContext';

const AuthView: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const { success, error: showError } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const email = `${username.toLowerCase()}@4real.app`;

    try {
      if (isLogin) {
        const data = await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        setToken(data.token);
        success(`Welcome back!`);
      } else {
        const data = await request('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, email, password })
        });
        setToken(data.token);
        success('Account created! Welcome to the notebook.');
      }
      await refreshUser();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
      showError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <SketchyContainer fill="#fff" roughness={1}>
        <div className="text-center mb-6 relative">
          <div className="relative inline-block">
            <h1 className="text-6xl font-bold italic mb-2 tracking-tighter" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>4real</h1>
            <div className="highlighter w-full bottom-4 left-0"></div>
          </div>
          <p className="opacity-70 italic mt-2">Hand-drawn competition starts here.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold mb-1 ml-1 uppercase opacity-60">Username (Pseudonym)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-b-2 border-black/20 focus:border-black p-2 text-xl font-bold"
              placeholder="CoolSketcher42"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-1 ml-1 uppercase opacity-60">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b-2 border-black/20 focus:border-black p-2 text-xl font-bold"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm font-bold ml-1">Error: {error}</p>}

          <SketchyButton 
            type="submit" 
            className="w-full text-xl" 
            disabled={loading}
            activeColor="#fef3c7"
          >
            {loading ? 'Processing...' : (isLogin ? 'Enter Notebook' : 'Create Character')}
          </SketchyButton>
        </form>

        <div className="mt-8 text-center">
          <p className="opacity-60 italic mb-2">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </p>
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="font-bold underline hover:no-underline"
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

export default AuthView;
