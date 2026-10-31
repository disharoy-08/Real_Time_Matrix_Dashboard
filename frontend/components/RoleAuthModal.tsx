'use client';

import React, { useState } from 'react';
import { User, Role } from '../types/metrics';
import { loginUser } from '../services/metricsApi';
import { Shield, Key, Check, UserCheck, X, LogIn, Lock } from 'lucide-react';

interface RoleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onLoginSuccess: (user: User, token: string) => void;
  onLogout: () => void;
}

export function RoleAuthModal({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}: RoleAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleQuickLogin = async (roleEmail: string, rolePass: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(roleEmail, rolePass);
      onLoginSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loginUser(email, password);
      onLoginSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Role-Based Access Control (RBAC)</h3>
            <p className="text-xs text-slate-400">Switch permissions to test server-side authorization</p>
          </div>
        </div>

        {/* Current Active User Status */}
        {currentUser && (
          <div className="mb-5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-xs font-semibold text-slate-200 block">{currentUser.username}</span>
                <span className="text-[10px] font-mono text-slate-400">{currentUser.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                {currentUser.role}
              </span>
              <button
                onClick={onLogout}
                className="text-xs text-rose-400 hover:text-rose-300 underline font-mono"
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* Fast Switch 1-Click Demo Profiles */}
        <div className="mb-5">
          <label className="block text-xs font-mono text-slate-400 mb-2">
            1-Click Instant Demo Authentication
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* Viewer */}
            <button
              onClick={() => handleQuickLogin('viewer@spectrapulse.io', 'viewer123')}
              disabled={loading}
              className="p-2.5 rounded-lg border text-left transition bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-cyan-500/40 group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-cyan-400 font-mono">VIEWER</span>
                <Lock className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
              </div>
              <span className="text-[10px] text-slate-400 block leading-tight">Read-only Telemetry</span>
            </button>

            {/* Operator */}
            <button
              onClick={() => handleQuickLogin('operator@spectrapulse.io', 'operator123')}
              disabled={loading}
              className="p-2.5 rounded-lg border text-left transition bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-amber-500/40 group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-amber-400 font-mono">OPERATOR</span>
                <Key className="w-3 h-3 text-slate-500 group-hover:text-amber-400" />
              </div>
              <span className="text-[10px] text-slate-400 block leading-tight">Chaos Testing</span>
            </button>

            {/* Admin */}
            <button
              onClick={() => handleQuickLogin('admin@spectrapulse.io', 'admin123')}
              disabled={loading}
              className="p-2.5 rounded-lg border text-left transition bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-rose-500/40 group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-rose-400 font-mono">ADMIN</span>
                <Shield className="w-3 h-3 text-slate-500 group-hover:text-rose-400" />
              </div>
              <span className="text-[10px] text-slate-400 block leading-tight">Full Hub Power</span>
            </button>
          </div>
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-slate-800">
          {error && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. operator@spectrapulse.io"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{loading ? 'Authenticating...' : 'Sign In with JWT'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
