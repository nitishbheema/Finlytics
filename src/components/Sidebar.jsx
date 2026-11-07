import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  LayoutDashboard, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  PieChart, 
  FolderKanban, 
  FileText, 
  UserCircle, 
  LogOut, 
  Sun, 
  Moon 
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { logout } = useAuth();
  const { isLight, toggleTheme } = useTheme();

  const navItems = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { name: 'Add Income', to: '/income', icon: ArrowDownCircle },
    { name: 'Add Expense', to: '/expenses', icon: ArrowUpCircle },
    { name: 'Category Budgets', to: '/category-budgets', icon: PieChart },
    { name: 'Manage Categories', to: '/categories', icon: FolderKanban },
    { name: 'Reports & Export', to: '/reports', icon: FileText },
    { name: 'Profile', to: '/profile', icon: UserCircle },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-64
        bg-[#161618] light:bg-white border-r border-white/[0.07] light:border-black/[0.07]
        flex flex-col justify-between transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand header */}
        <div>
          <div className="h-16 flex items-center px-6 border-b border-white/[0.07] light:border-black/[0.07]">
            <NavLink to="/dashboard" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg shadow-glow">
                F
              </div>
              <div>
                <span className="font-display font-bold text-lg tracking-tight text-[#f2f2f0] light:text-[#1a1a18]">
                  Finlytics
                </span>
                <span className="text-[10px] block text-brand font-medium tracking-wider uppercase -mt-1">
                  Pro Finance
                </span>
              </div>
            </NavLink>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all
                    ${isActive 
                      ? 'bg-brand/15 text-brand font-semibold shadow-sm' 
                      : 'text-[#a8a8a3] light:text-[#5a5a55] hover:text-[#f2f2f0] light:hover:text-[#1a1a18] hover:bg-white/[0.04] light:hover:bg-black/[0.04]'}
                  `}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm text-[#e0655a] hover:bg-[#e0655a]/10 transition-all text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Logout</span>
            </button>
          </nav>
        </div>

        {/* Footer / Theme Toggle */}
        <div className="p-4 border-t border-white/[0.07] light:border-black/[0.07]">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.04] light:bg-black/[0.04] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] transition-all"
          >
            <span className="flex items-center gap-2">
              {isLight ? <Sun className="w-4 h-4 text-brand" /> : <Moon className="w-4 h-4 text-brand" />}
              <span>{isLight ? 'Light Mode' : 'Dark Mode'}</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.08] light:bg-black/[0.08]">
              Toggle
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
