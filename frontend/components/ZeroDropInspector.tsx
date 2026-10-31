'use client';

import React from 'react';
import { PacketDropStats, MetricEvent } from '../types/metrics';
import { ShieldCheck, CheckCircle2, AlertOctagon, History, ArrowRightLeft } from 'lucide-react';

interface ZeroDropInspectorProps {
  stats: PacketDropStats;
  recentEvents: MetricEvent[];
  onManualGapRecovery?: () => void;
}

export function ZeroDropInspector({ stats, recentEvents, onManualGapRecovery }: ZeroDropInspectorProps) {
  const isZeroDrop = stats.missingSeqCount === 0;

  return (
    <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Application-Level Zero Drop Telemetry Verification
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SEQ-ID ENFORCED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Monotonically increasing sequence ID validator & PostgreSQL historical gap healing
            </p>
          </div>
        </div>

        {onManualGapRecovery && (
          <button
            onClick={onManualGapRecovery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Verify Gap Sync</span>
          </button>
        )}
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Total Ingested */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Total Ingested</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-white">
              {stats.receivedCount.toLocaleString()}
            </span>
            <span className="text-[10px] font-mono text-slate-500">packets</span>
          </div>
        </div>

        {/* Delivery Guarantee */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Delivery SLA</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono ${
                isZeroDrop ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {stats.deliveryRatePercent}%
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
          </div>
        </div>

        {/* Missing / Dropped Seq IDs */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Missing Packet Gaps</span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-bold font-mono ${
                stats.missingSeqCount === 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.missingSeqCount}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {stats.missingSeqCount === 0 ? 'Zero Drops' : 'Packet gaps'}
            </span>
          </div>
        </div>

        {/* Recovered via History */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400 block mb-1">Healed Gaps (Postgres)</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-cyan-400">
              {stats.recoveredGapsCount}
            </span>
            <span className="text-[10px] font-mono text-slate-500">recovered</span>
          </div>
        </div>
      </div>

      {/* Monotonic Sequence Wire Monitor (Live Stream) */}
      <div className="rounded-lg bg-slate-950/90 border border-slate-800/80 p-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
          <div className="flex items-center gap-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
            <span>Monotonic Sequence Wire Inspector (Last Ingested)</span>
          </div>
          <span className="text-slate-500 text-[11px]">Head Seq ID: #{stats.lastSeqId}</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {recentEvents.slice(0, 8).map((ev) => (
            <div
              key={ev.id}
              className="flex-shrink-0 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono"
            >
              <div className="flex items-center justify-between gap-3 text-cyan-400 font-bold">
                <span>#{ev.seq_id}</span>
                <span className="text-[9px] text-slate-500 uppercase">{ev.node_id}</span>
              </div>
              <div className="text-slate-300 truncate max-w-[120px]">{ev.service}</div>
              <div className="text-slate-500 text-[10px]">
                {ev.name}: <span className="text-slate-200">{ev.value.toFixed(1)}</span>
              </div>
            </div>
          ))}
          {recentEvents.length === 0 && (
            <span className="text-xs font-mono text-slate-600 py-2">
              Waiting for live telemetry packets...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
