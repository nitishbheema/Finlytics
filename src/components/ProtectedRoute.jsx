import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0f] light:bg-[#f5f5f3] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
        <span className="text-xs text-[#a8a8a3] font-medium tracking-wide">Loading Finlytics...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
