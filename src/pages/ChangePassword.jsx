import React, { useState } from 'react';
import { api } from '../utils/api';
import { Key, Lock, CheckCircle, XCircle, ArrowLeft, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const isMatching = confirmPassword.length > 0 && newPassword === confirmPassword;
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setLoading(true);

    try {
      const data = await api.put('/user/change-password', {
        current,
        newPassword,
        confirmPassword,
      });

      setMsg({ type: 'success', text: data.message });
      setCurrent('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            🔒 Change Password
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Ensure your account remains safe with a robust password
          </p>
        </div>
        <Link
          to="/profile"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-[#f2f2f0] light:text-[#1a1a18]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Profile</span>
        </Link>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-[#5cb98a]/10 border border-[#5cb98a]/20 text-[#5cb98a]'
              : 'bg-[#e0655a]/10 border border-[#e0655a]/20 text-[#e0655a]'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-6 md:p-8 rounded-3xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-5">
          Update Your Credentials
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              New Password *
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />

            {/* Match feedback */}
            {isMatching && (
              <p className="text-[11px] text-[#5cb98a] font-medium flex items-center gap-1 mt-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Passwords match</span>
              </p>
            )}
            {isMismatch && (
              <p className="text-[11px] text-[#e0655a] font-medium flex items-center gap-1 mt-1.5">
                <XCircle className="w-3.5 h-3.5" />
                <span>Passwords do not match</span>
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || isMismatch}
              className="w-full py-3 px-5 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-glow transition-all disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{loading ? 'Updating...' : 'Update Password'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-white/[0.07] light:border-black/[0.07]">
          <p className="text-[11px] text-[#636360] light:text-[#9a9a93] leading-relaxed">
            💡 Pro-tip: For optimal account safety, choose a password featuring a blend of numbers, symbols, and uppercase letters.
          </p>
        </div>
      </div>
    </div>
  );
}
