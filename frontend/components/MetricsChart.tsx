'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { MetricEvent } from '../types/metrics';

interface MetricsChartProps {
  title: string;
  metricName: string;
  unit: string;
  services: string[];
  metricsByService: Record<string, Record<string, MetricEvent[]>>;
}

const SERVICE_COLORS: Record<string, { stroke: string; fill: string }> = {
  'api-gateway': { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)' },
  'auth-service': { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.15)' },
  'payment-service': { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)' },
  'order-worker': { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)' },
};

const DEFAULT_COLOR = { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)' };

export function MetricsChart({
  title,
  metricName,
  unit,
  services,
  metricsByService,
}: MetricsChartProps) {
  // Transform multi-service timeseries data into aligned timestamps for Recharts
  const chartData = useMemo(() => {
    // Collect all timestamps across all services for this metric
    const timeMap = new Map<number, Record<string, number | string>>();

    services.forEach((service) => {
      const events = metricsByService[service]?.[metricName] || [];
      events.forEach((ev) => {
        const time = new Date(ev.timestamp).getTime();
        // Bucket to nearest second to align multi-node telemetry smoothly
        const bucketTime = Math.floor(time / 1000) * 1000;

        let entry = timeMap.get(bucketTime);
        if (!entry) {
          const d = new Date(bucketTime);
          const timeLabel = d.toTimeString().split(' ')[0]; // HH:MM:SS
          entry = { timeLabel, timestamp: bucketTime };
          timeMap.set(bucketTime, entry);
        }
        entry[service] = Number(ev.value.toFixed(2));
      });
    });

    // Sort chronologically and take the most recent 60 time buckets
    const sorted = Array.from(timeMap.values()).sort(
      (a, b) => (a.timestamp as number) - (b.timestamp as number)
    );
    return sorted.slice(-60);
  }, [services, metricsByService, metricName]);

  const hasData = chartData.length > 0;

  return (
    <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 transition-all hover:border-slate-700/80">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          <span className="text-xs font-mono text-slate-400">
            Real-time multi-cluster telemetry ({unit})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {services.map((svc) => (
            <div key={svc} className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SERVICE_COLORS[svc]?.stroke || DEFAULT_COLOR.stroke }}
              />
              <span>{svc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64">
        {!hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400 mb-2"></div>
            <span>Awaiting telemetry stream for {metricName}...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                {services.map((svc) => {
                  const color = SERVICE_COLORS[svc] || DEFAULT_COLOR;
                  return (
                    <linearGradient key={`grad-${svc}`} id={`grad-${svc}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color.stroke} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={color.stroke} stopOpacity={0.0} />
                    </linearGradient>
                  );
                })}
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

              <XAxis
                dataKey="timeLabel"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                domain={['auto', 'auto']}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                }}
                labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                formatter={(value: any, name: any) => [`${value} ${unit}`, `${name}`]}
              />

              {services.map((svc) => {
                const color = SERVICE_COLORS[svc] || DEFAULT_COLOR;
                return (
                  <Area
                    key={svc}
                    type="monotone"
                    dataKey={svc}
                    name={svc}
                    stroke={color.stroke}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#grad-${svc})`}
                    isAnimationActive={false}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
