import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { useToast } from '../app/ToastProvider';
import { LogOut, Home, Landmark, ShieldCheck, User } from 'lucide-react';
import { formatMoneyValue } from '../utils/exact-money.ts';
import { SketchyButton } from './SketchyButton';

const Navbar = () => {
  const { userData, user, logout } = useAuth();
  const navigate = useNavigate();
  const { error, info } = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      info('Logged out successfully.');
      navigate('/auth/login');
    } catch (logoutError) {
      error(logoutError instanceof Error ? logoutError.message : 'Unable to log out right now.');
    }
  };

  return (
    <>
      {/* ── Top navbar ── */}
      <nav className="border-b-2 border-[#1a1a1a] bg-paper sticky top-0 z-50">
        <div className="container mx-auto px-3 md:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6">
            <Link to="/play" className="relative group">
              <span className="font-display text-2xl md:text-4xl font-bold italic transform -rotate-2 hover:rotate-0 transition-all inline-block relative z-10" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>
                4real
              </span>
              <div className="highlighter w-full bottom-1 left-0 group-hover:scale-x-110 transition-transform"></div>
            </Link>
            <div className="hidden md:flex items-center gap-4">
              <NavLink
                to="/play"
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

          <div className="flex items-center gap-2 md:gap-4">
            {/* Balance — compact on mobile */}
            <div className="flex flex-col items-end mr-1 md:mr-4">
              <span className="text-[8px] md:text-[10px] uppercase font-bold opacity-50 tracking-tighter">Balance</span>
              <span className="font-bold text-base md:text-xl">${formatMoneyValue(userData?.balance)}</span>
            </div>

            {userData?.isAdmin && (
              <Link
                to="/merchant"
                className="hidden md:flex items-center gap-2 border-2 border-ink-blue px-3 py-1 text-sm font-bold text-ink-blue transition-colors hover:bg-ink-blue/10"
              >
                <ShieldCheck size={18} />
                Ops
              </Link>
            )}
            
            <Link to="/auth/security" className="p-2 hover:bg-black/5" aria-label="Open security settings">
              <ShieldCheck size={24} />
            </Link>

            {/* Profile and logout are desktop-only. Mobile sign-out lives in account/security actions. */}
            {user ? (
              <Link to={`/profile/${user.id}`} className="hidden md:block p-2 hover:bg-black/5" aria-label="Open profile">
                <User size={24} />
              </Link>
            ) : null}
            
            <SketchyButton
              aria-label="Log out"
              className="hidden p-2 transition-colors hover:bg-red-50 hover:text-red-600 md:block"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={24} />
            </SketchyButton>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom navigation (visible only on small screens) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#1a1a1a] bg-paper"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around py-2">
          <NavLink
            to="/play"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs font-bold px-4 py-1 ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
            }
          >
            <Home size={22} />
            Lobby
          </NavLink>
          <NavLink
            to="/bank"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs font-bold px-4 py-1 ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
            }
          >
            <Landmark size={22} />
            Bank
          </NavLink>
          {user ? (
            <NavLink
              to={`/profile/${user.id}`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 text-xs font-bold px-4 py-1 ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
              }
            >
              <User size={22} />
              Profile
            </NavLink>
          ) : null}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
