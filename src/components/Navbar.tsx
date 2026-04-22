import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TonConnectButton } from '@tonconnect/ui-react';
import { useAuth } from '../lib/AuthContext';
import { SketchyButton } from './SketchyButton';
import { useToast } from '../lib/ToastContext';
import { LogOut, Home, Landmark, User, Trophy } from 'lucide-react';

const Navbar: React.FC = () => {
  const { userData, user, logout } = useAuth();
  const navigate = useNavigate();
  const { info } = useToast();

  const handleLogout = async () => {
    logout();
    info('Logged out successfully.');
    navigate('/auth');
  };

  return (
    <nav className="border-b-2 border-[#1a1a1a] bg-[#F2EFE9] sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="relative group">
            <span className="text-4xl font-bold italic transform -rotate-2 hover:rotate-0 transition-all inline-block relative z-10" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>
              4real
            </span>
            <div className="highlighter w-full bottom-1 left-0 group-hover:scale-x-110 transition-transform"></div>
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <Link to="/" className="flex items-center gap-1 hover:underline font-bold text-lg">
              <Home size={20} /> Lobby
            </Link>
            <Link to="/bank" className="flex items-center gap-1 hover:underline font-bold text-lg">
              <Landmark size={20} /> Bank
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[10px] uppercase font-bold opacity-50 tracking-tighter">Liquid Balance</span>
            <span className="font-bold text-xl">${userData?.balance?.toFixed(2) || '0.00'}</span>
          </div>
          
          <div className="relative">
            <div className="tape"></div>
            <TonConnectButton />
          </div>

          <Link to={`/profile/${user?.uid}`} className="p-2 hover:bg-black/5 rounded-full">
            <User size={24} />
          </Link>
          
          <button onClick={handleLogout} className="p-2 hover:text-red-600 transition-colors">
            <LogOut size={24} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
