import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { User, Key, Upload, Save, X, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBudget(user.budget?.toString() || '0');
      setPhotoPreview(user.photo || null);
    }
  }, [user]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Invalid file type. Please upload a valid image file.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Image file is too large. Max allowed size is 5MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target.result);
      setPhotoBase64(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const payload = {
        name,
        budget: parseFloat(budget || 0),
        ...(photoBase64 ? { photo: photoBase64 } : {}),
      };

      const data = await api.put('/user/profile', payload);
      if (data.success) {
        updateUser(data.user);
        setMsg({ type: 'success', text: '✅ Profile updated successfully!' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  const avatarDisplay = photoPreview
    ? photoPreview
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&size=110&background=1e3c72&color=fff&rounded=true`;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            👤 My Profile
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Manage your personal settings and monthly budget threshold
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-[#f2f2f0] light:text-[#1a1a18]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
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
        {/* AVATAR PREVIEW */}
        <div className="flex flex-col items-center mb-6 pb-6 border-b border-white/[0.07] light:border-black/[0.07]">
          <div className="relative group">
            <img
              src={avatarDisplay}
              alt="Profile"
              className="w-24 h-24 rounded-full object-cover ring-4 ring-brand/20 shadow-glow"
              onError={(e) => {
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&size=110&background=1e3c72&color=fff`;
              }}
            />
            <label
              htmlFor="photoUpload"
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
            >
              <Upload className="w-6 h-6 text-white" />
            </label>
            <input
              type="file"
              id="photoUpload"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <h2 className="text-base font-bold text-[#f2f2f0] light:text-[#1a1a18] mt-3">
            {name || 'Finlytics User'}
          </h2>
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55]">
            {user?.email}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              readOnly
              value={user?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e0e0f] light:bg-[#e8e8e5] border border-white/[0.05] light:border-black/[0.05] text-[#636360] light:text-[#9a9a93] text-xs cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Monthly Budget (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-5 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-glow transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Update Profile'}</span>
            </button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-white/[0.07] light:border-black/[0.07] text-center">
          <Link
            to="/change-password"
            className="inline-flex items-center gap-1.5 text-xs text-brand font-medium hover:underline"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Change Your Password</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
