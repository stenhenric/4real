import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { Home, Landmark, MessageCircle, ShieldCheck, User } from 'lucide-react';
import { formatMoneyValue } from '../utils/exact-money.ts';

const Navbar = () => {
  const { userData, user } = useAuth();

  return (
    <>
      {/* ── Top navbar ── */}
      <nav className="border-b-2 border-ink-black bg-paper sticky top-0 z-50">
        <div className="container mx-auto px-3 md:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6">
            <Link to="/play" className="relative group">
              <span className="font-display text-2xl md:text-4xl font-bold italic transform -rotate-2 hover:rotate-0 transition-all inline-block relative z-10" style={{ textShadow: '1px 1px 0 var(--color-paper-rule)' }}>
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
              <NavLink
                to="/community"
                className={({ isActive }) => `flex items-center gap-1 font-bold text-lg ${isActive ? 'underline' : 'hover:underline'}`}
              >
                <MessageCircle size={20} /> Community
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

            {/* Profile is desktop-only. Sign-out lives on the Security page. */}
            {user ? (
              <Link to={`/profile/${user.id}`} className="hidden md:block p-2 hover:bg-black/5" aria-label="Open profile">
                <User size={24} />
              </Link>
            ) : null}
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom navigation (visible only on small screens) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink-black bg-paper"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around py-2">
          <NavLink
            to="/play"
            end
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1 text-xs font-bold ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
            }
          >
            <Home size={22} />
            Lobby
          </NavLink>
          <NavLink
            to="/bank"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1 text-xs font-bold ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
            }
          >
            <Landmark size={22} />
            Bank
          </NavLink>
          <NavLink
            to="/community"
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1 text-xs font-bold ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
            }
          >
            <MessageCircle size={22} />
            Community
          </NavLink>
          {user ? (
            <NavLink
              to={`/profile/${user.id}`}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 py-1 text-xs font-bold ${isActive ? 'text-black' : 'text-black/50 hover:text-black/80'}`
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
