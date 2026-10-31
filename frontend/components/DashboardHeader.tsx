'use client';

import React from 'react';
import { User, HealthStatus } from '../types/metrics';
import { Activity, Radio, Shield, User as UserIcon, Database, Layers } from 'lucide-react';

interface DashboardHeaderProps {
  health: HealthStatus | null;
  currentUser: User | null;
  onOpenAuthModal: () => void;
}

export function DashboardHeader({
  health,
  currentUser,
  onOpenAuthModal,
}: DashboardHeaderProps) {
  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m ${seconds % 60}s`;
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
      case 'operator':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
      case 'viewer':
      default:
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Engine */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 p-[1px] shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                SpectraPulse
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                v1.0 Go Distributed
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>Zero-Drop Real-Time Telemetry Hub</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Redis Fan-Out
              </span>
            </p>
          </div>
        </div>

        {/* System Health Quick Stats */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-400">
          {health && (
            <>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>DB:</span>
                <span className="text-slate-200 capitalize font-medium">{health.database_status}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pub/Sub:</span>
                <span className="text-slate-200 capitalize font-medium">{health.redis_status}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Uptime:</span>
                <span className="text-slate-200 font-medium">{formatUptime(health.uptime_seconds)}</span>
              </div>
            </>
          )}
        </div>

        {/* User Role Switcher Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAuthModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all hover:scale-[1.02] shadow-sm ${getRoleBadgeColor(
              currentUser?.role
            )}`}
          >
            <Shield className="w-3.5 h-3.5" />
            <div className="text-left">
              <span className="block font-semibold uppercase leading-none">
                {currentUser?.role || 'VIEWER (Guest)'}
              </span>
              <span className="text-[10px] opacity-75 font-sans leading-none">
                {currentUser?.username || 'Switch Role (RBAC)'}
              </span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
