'use client';

import React from 'react';
import { ConnectionState, PacketDropStats } from '../types/metrics';
import { Activity, RefreshCw, Server, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatusProps {
  state: ConnectionState;
  activeNode: string;
  eventRate: number;
  stats: PacketDropStats;
  onReconnect: () => void;
}

export function ConnectionStatus({
  state,
  activeNode,
  eventRate,
  stats,
  onReconnect,
}: ConnectionStatusProps) {
  const getBadgeStyle = () => {
    switch (state) {
      case 'connected':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'reconnecting':
      case 'connecting':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'disconnected':
      default:
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-xs">
      {/* WebSocket State Indicator */}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-medium transition-all ${getBadgeStyle()}`}
      >
        {state === 'connected' ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Wifi className="w-3.5 h-3.5" />
            <span className="capitalize tracking-wide font-mono">LIVE STREAM</span>
          </>
        ) : state === 'reconnecting' || state === 'connecting' ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="capitalize font-mono">{state}...</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            <span className="font-mono">DISCONNECTED</span>
            <button
              onClick={onReconnect}
              className="ml-1 underline hover:text-white transition"
              title="Click to reconnect"
            >
              Retry
            </button>
          </>
        )}
      </div>

      {/* Cluster Node ID */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 font-mono">
        <Server className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-slate-400">Node:</span>
        <span className="text-cyan-300 font-semibold uppercase">{activeNode}</span>
      </div>

      {/* Ingestion Velocity */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 font-mono">
        <Activity className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-slate-400">Velocity:</span>
        <span className="text-indigo-300 font-bold">{eventRate}</span>
        <span className="text-slate-500 text-[10px]">ev/s</span>
      </div>

      {/* Zero Packet Drop SLA Status */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 text-slate-300 font-mono">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-slate-400">Zero-Drop SLA:</span>
        <span
          className={`font-bold ${
            stats.missingSeqCount === 0 ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {stats.deliveryRatePercent}%
        </span>
        {stats.missingSeqCount > 0 && (
          <span className="text-amber-500 text-[10px]">({stats.missingSeqCount} gap)</span>
        )}
      </div>
    </div>
  );
}
