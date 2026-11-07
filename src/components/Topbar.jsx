import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bell, Menu, User, Key, LogOut } from 'lucide-react';

export default function Topbar({ onMenuClick, summaryData }) {
  const { user, logout } = useAuth();
  const [showNotif, setShowNotif] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalSpent = summaryData?.expenseTotal || 0;
  const budget = summaryData?.budget || user?.budget || 0;
  const budgetExceeded = budget > 0 && totalSpent > budget;

  const avatarSrc = user?.photo
    ? (user.photo.startsWith('http') || user.photo.startsWith('data:') ? user.photo : `/uploads/${user.photo}`)
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&size=42&background=1e3c72&color=fff&rounded=true`;

  return (
    <header className="h-16 px-4 md:px-8 bg-[#161618] light:bg-white border-b border-white/[0.07] light:border-black/[0.07] flex items-center justify-between sticky top-0 z-30 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg lg:hidden hover:bg-white/[0.06] light:hover:bg-black/[0.06] text-[#a8a8a3]"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-sm md:text-base font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
            Welcome back, <span className="text-brand">{user?.name || 'User'}</span> 👋
          </h2>
          <p className="text-xs text-[#636360] light:text-[#9a9a93] hidden sm:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotif(!showNotif)}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] light:bg-black/[0.04] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-[#f2f2f0] light:text-[#1a1a18] transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4 text-brand" />
            {budgetExceeded && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#e0655a] ring-2 ring-[#161618] light:ring-white" />
            )}
          </button>

          {showNotif && (
            <div className="absolute right-0 mt-2 w-72 p-4 rounded-2xl bg-[#1e1e21] light:bg-white border border-white/[0.1] light:border-black/[0.1] shadow-floating z-50 animate-fadeIn">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#a8a8a3] light:text-[#5a5a55] mb-3">
                Financial Alerts
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/[0.05] light:border-black/[0.05]">
                  <span className="text-[#a8a8a3] light:text-[#5a5a55]">Total Spent:</span>
                  <span className="font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                    ₹{Number(totalSpent).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/[0.05] light:border-black/[0.05]">
                  <span className="text-[#a8a8a3] light:text-[#5a5a55]">Monthly Budget:</span>
                  <span className="font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                    ₹{Number(budget).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="pt-2">
                  {budgetExceeded ? (
                    <p className="text-[#e0655a] font-medium flex items-center gap-1.5">
                      <span>⚠️</span> Budget Exceeded by ₹{Number(totalSpent - budget).toLocaleString('en-IN')}!
                    </p>
                  ) : (
                    <p className="text-[#5cb98a] font-medium flex items-center gap-1.5">
                      <span>✔</span> Within Budget
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-brand/40 transition-all"
          >
            <img
              src={avatarSrc}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover ring-1 ring-white/10"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&size=42&background=1e3c72&color=fff`;
              }}
            />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 p-2 rounded-2xl bg-[#1e1e21] light:bg-white border border-white/[0.1] light:border-black/[0.1] shadow-floating z-50">
              <div className="px-3 py-2 border-b border-white/[0.07] light:border-black/[0.07] mb-1">
                <p className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18] truncate">
                  {user?.name}
                </p>
                <p className="text-[11px] text-[#636360] light:text-[#9a9a93] truncate">
                  {user?.email}
                </p>
              </div>

              <Link
                to="/profile"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl font-medium text-[#a8a8a3] light:text-[#5a5a55] hover:text-[#f2f2f0] light:hover:text-[#1a1a18] hover:bg-white/[0.05] light:hover:bg-black/[0.05]"
              >
                <User className="w-3.5 h-3.5 text-brand" />
                <span>My Profile</span>
              </Link>

              <Link
                to="/change-password"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl font-medium text-[#a8a8a3] light:text-[#5a5a55] hover:text-[#f2f2f0] light:hover:text-[#1a1a18] hover:bg-white/[0.05] light:hover:bg-black/[0.05]"
              >
                <Key className="w-3.5 h-3.5 text-brand" />
                <span>Change Password</span>
              </Link>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl font-medium text-[#e0655a] hover:bg-[#e0655a]/10 text-left mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
