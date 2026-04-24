import { Link, NavLink, useNavigate } from 'react-router-dom';
import { TonConnectButton } from '@tonconnect/ui-react';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { LogOut, Home, Landmark, ShieldCheck, User } from 'lucide-react';

const Navbar = () => {
  const { userData, user, logout } = useAuth();
  const navigate = useNavigate();
  const { info } = useToast();

  const handleLogout = async () => {
    await logout();
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
            <NavLink
              to="/"
              className={({ isActive }) => `flex items-center gap-1 font-bold text-lg ${isActive ? 'underline' : 'hover:underline'}`}
            >
              <Home size={20} /> Lobby
            </NavLink>
            <NavLink
              to="/bank"
              className={({ isActive }) => `flex items-center gap-1 font-bold text-lg ${isActive ? 'underline' : 'hover:underline'}`}
            >
              <Landmark size={20} /> Bank
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[10px] uppercase font-bold opacity-50 tracking-tighter">Liquid Balance</span>
            <span className="font-bold text-xl">${userData?.balance?.toFixed(2) || '0.00'}</span>
          </div>

          {userData?.isAdmin && (
            <Link
              to="/merchant"
              className="flex items-center gap-2 rounded-full border-2 border-ink-blue px-3 py-1 text-sm font-bold text-ink-blue transition-colors hover:bg-ink-blue/10"
            >
              <ShieldCheck size={18} />
              Ops
            </Link>
          )}
          
          <div className="relative">
            <div className="tape"></div>
            <TonConnectButton />
          </div>

          <Link to={`/profile/${user?.id}`} className="p-2 hover:bg-black/5 rounded-full" aria-label="Open profile">
            <User size={24} />
          </Link>
          
          <button onClick={handleLogout} className="p-2 hover:text-red-600 transition-colors" aria-label="Log out" type="button">
            <LogOut size={24} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
