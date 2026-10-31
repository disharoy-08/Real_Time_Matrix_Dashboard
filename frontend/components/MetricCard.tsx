'use client';

import React from 'react';
import { MetricEvent } from '../types/metrics';
import { ArrowDownRight, ArrowUpRight, Cpu, Database, Gauge, HardDrive, Zap, AlertTriangle } from 'lucide-react';

interface MetricCardProps {
  service: string;
  metricName: string;
  events: MetricEvent[];
}

export function MetricCard({ service, metricName, events }: MetricCardProps) {
  const latest = events.length > 0 ? events[events.length - 1] : null;
  const previous = events.length > 1 ? events[events.length - 2] : null;

  const currentVal = latest ? latest.value : 0;
  const prevVal = previous ? previous.value : currentVal;
  const diff = currentVal - prevVal;
  const unit = latest?.unit || '';

  // Calculate statistics across window
  const values = events.map((e) => e.value);
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 0;
  const avgVal = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  // Determine health threshold
  let status: 'normal' | 'warning' | 'critical' = 'normal';
  if (metricName === 'cpu_percent') {
    if (currentVal > 85) status = 'critical';
    else if (currentVal > 70) status = 'warning';
  } else if (metricName === 'error_rate') {
    if (currentVal > 5) status = 'critical';
    else if (currentVal > 1) status = 'warning';
  } else if (metricName === 'latency_ms') {
    if (currentVal > 250) status = 'critical';
    else if (currentVal > 100) status = 'warning';
  }

  const getMetricIcon = (name: string) => {
    switch (name) {
      case 'cpu_percent':
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      case 'memory_mb':
        return <HardDrive className="w-4 h-4 text-indigo-400" />;
      case 'request_rate':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'error_rate':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'latency_ms':
        return <Gauge className="w-4 h-4 text-emerald-400" />;
      default:
        return <Database className="w-4 h-4 text-purple-400" />;
    }
  };

  const formatMetricName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getStatusBadge = () => {
    if (status === 'critical') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
          CRITICAL
        </span>
      );
    }
    if (status === 'warning') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40">
          WARN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        NORMAL
      </span>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 transition-all hover:border-slate-700/90 hover:shadow-lg hover:shadow-cyan-950/20">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
            {getMetricIcon(metricName)}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200">{formatMetricName(metricName)}</h4>
            <span className="text-[11px] font-mono text-slate-400">{service}</span>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Main Metric Value */}
      <div className="flex items-baseline justify-between mt-3 mb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold font-mono tracking-tight text-white">
            {currentVal.toLocaleString(undefined, {
              minimumFractionDigits: unit === '%' ? 1 : 0,
              maximumFractionDigits: 1,
            })}
          </span>
          <span className="text-xs font-mono text-slate-400">{unit}</span>
        </div>

        {/* Delta */}
        <div
          className={`flex items-center text-xs font-mono font-medium ${
            diff > 0
              ? 'text-rose-400'
              : diff < 0
              ? 'text-emerald-400'
              : 'text-slate-500'
          }`}
        >
          {diff > 0 ? (
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
          ) : diff < 0 ? (
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
          ) : null}
          <span>{Math.abs(diff).toFixed(1)}</span>
        </div>
      </div>

      {/* Aggregates Footer */}
      <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800/70 text-[10px] font-mono text-slate-400">
        <div>
          <span className="text-slate-500 block">MIN</span>
          <span className="text-slate-300 font-semibold">{minVal.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-slate-500 block">AVG</span>
          <span className="text-slate-300 font-semibold">{avgVal.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-slate-500 block">MAX</span>
          <span className="text-slate-300 font-semibold">{maxVal.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
