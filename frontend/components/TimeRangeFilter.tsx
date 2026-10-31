'use client';

import React from 'react';
import { Clock, SlidersHorizontal } from 'lucide-react';

export type TimeWindow = '30s' | '1m' | '5m' | '15m';
export type MetricTypeFilter = 'all' | 'cpu_percent' | 'memory_mb' | 'request_rate' | 'error_rate' | 'latency_ms';

interface TimeRangeFilterProps {
  timeWindow: TimeWindow;
  onTimeWindowChange: (window: TimeWindow) => void;
  metricType: MetricTypeFilter;
  onMetricTypeChange: (type: MetricTypeFilter) => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

export function TimeRangeFilter({
  timeWindow,
  onTimeWindowChange,
  metricType,
  onMetricTypeChange,
  isPaused,
  onTogglePause,
}: TimeRangeFilterProps) {
  const windows: TimeWindow[] = ['30s', '1m', '5m', '15m'];
  const metricTypes: { key: MetricTypeFilter; label: string }[] = [
    { key: 'all', label: 'All Telemetry' },
    { key: 'cpu_percent', label: 'CPU' },
    { key: 'memory_mb', label: 'Memory' },
    { key: 'request_rate', label: 'RPS' },
    { key: 'error_rate', label: 'Errors' },
    { key: 'latency_ms', label: 'Latency' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/80">
      {/* Metric Category Selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 text-xs text-slate-400 font-medium mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
          <span>Metric:</span>
        </div>
        {metricTypes.map((m) => (
          <button
            key={m.key}
            onClick={() => onMetricTypeChange(m.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              metricType === m.key
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Time Window & Pause toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-slate-400 font-medium mr-1">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>Window:</span>
        </div>
        <div className="flex items-center rounded-lg bg-slate-950/70 p-1 border border-slate-800">
          {windows.map((w) => (
            <button
              key={w}
              onClick={() => onTimeWindowChange(w)}
              className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-all ${
                timeWindow === w
                  ? 'bg-slate-800 text-cyan-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Live Freeze / Resume Toggle */}
        <button
          onClick={onTogglePause}
          className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all border ${
            isPaused
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
          }`}
        >
          {isPaused ? '⏸ PAUSED' : '▶ LIVE'}
        </button>
      </div>
    </div>
  );
}
