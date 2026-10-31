'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { User, Role, HealthStatus, MetricEvent } from '../types/metrics';
import { useMetricsSocket } from '../hooks/useMetricsSocket';
import { fetchHealth } from '../services/metricsApi';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { ServiceFilter } from '../components/ServiceFilter';
import { TimeRangeFilter, TimeWindow, MetricTypeFilter } from '../components/TimeRangeFilter';
import { MetricCard } from '../components/MetricCard';
import { MetricsChart } from '../components/MetricsChart';
import { ZeroDropInspector } from '../components/ZeroDropInspector';
import { ChaosControls } from '../components/ChaosControls';
import { RoleAuthModal } from '../components/RoleAuthModal';
import {
  Activity,
  Layers,
  Radio,
  Shield,
  Server,
  Zap,
  Terminal,
  Database,
  Flame,
  CheckCircle2,
  HardDrive,
  Cpu,
  Clock,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

const ALL_SERVICES = ['api-gateway', 'auth-service', 'payment-service', 'order-worker'];

type ActiveTab = 'metrics' | 'inspector' | 'chaos' | 'cluster';

export default function DashboardPage() {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('metrics');

  // Auth & Role
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Filters & Stream State
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1m');
  const [metricFilter, setMetricFilter] = useState<MetricTypeFilter>('all');
  const [isPaused, setIsPaused] = useState(false);

  // System Health
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // WebSocket hook
  const {
    connectionState,
    metricsByService,
    latestEvents,
    eventRate,
    activeNode,
    stats,
    manualReconnect,
  } = useMetricsSocket({
    services: selectedServices,
    token: authToken,
    autoRecoverGaps: true,
  });

  // Health poll
  useEffect(() => {
    const updateHealth = async () => {
      try {
        const h = await fetchHealth();
        setHealth(h);
      } catch {
        // Backend offline during startup
      }
    };
    updateHealth();
    const interval = setInterval(updateHealth, 4000);
    return () => clearInterval(interval);
  }, []);

  const effectiveServices = useMemo(() => {
    return selectedServices.length > 0 ? selectedServices : ALL_SERVICES;
  }, [selectedServices]);

  const handleLoginSuccess = (user: User, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAuthToken(undefined);
  };

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m ${seconds % 60}s`;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070a12] text-slate-100 font-sans">
      {/* 1. LEFT ACTIVITY BAR (Slim high-tech nav) */}
      <aside className="w-16 flex-shrink-0 flex flex-col items-center justify-between py-4 bg-slate-950/80 border-r border-slate-800/80 z-30">
        <div className="flex flex-col items-center gap-6">
          {/* Logo Badge */}
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-purple-600 p-[1px] shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col items-center gap-2">
            <button
              onClick={() => setActiveTab('metrics')}
              title="Telemetry Metrics"
              className={`p-2.5 rounded-xl transition ${
                activeTab === 'metrics'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Activity className="w-5 h-5" />
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              title="Zero-Drop Packet Inspector"
              className={`p-2.5 rounded-xl transition ${
                activeTab === 'inspector'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Shield className="w-5 h-5" />
            </button>

            <button
              onClick={() => setActiveTab('chaos')}
              title="Chaos Engineering Lab"
              className={`p-2.5 rounded-xl transition ${
                activeTab === 'chaos'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Flame className="w-5 h-5" />
            </button>

            <button
              onClick={() => setActiveTab('cluster')}
              title="Cluster & Node Diagnostics"
              className={`p-2.5 rounded-xl transition ${
                activeTab === 'cluster'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Server className="w-5 h-5" />
            </button>
          </nav>
        </div>

        {/* User Identity / RBAC Modal Trigger */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            title={`Logged in as ${currentUser?.role || 'Guest (Viewer)'}`}
            className="relative p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition"
          >
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-slate-950" />
          </button>
        </div>
      </aside>

      {/* 2. SECONDARY DRAWER: Service Explorer & Fast Chaos Presets */}
      <aside className="w-64 flex-shrink-0 hidden md:flex flex-col bg-slate-950/40 border-r border-slate-800/80 p-4 overflow-y-auto">
        {/* Workspace Title */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Telemetry Mesh</span>
          </div>
          <h2 className="text-sm font-bold text-slate-100">SpectraPulse Console</h2>
          <span className="text-[11px] font-mono text-emerald-400">Go 1.24 Hub Active</span>
        </div>

        {/* Microservices Checklist */}
        <div className="mb-6 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
            <span>CLUSTERS</span>
            <button
              onClick={() => setSelectedServices([])}
              className="text-cyan-400 hover:underline text-[10px]"
            >
              Reset
            </button>
          </div>

          {ALL_SERVICES.map((svc) => {
            const isSelected = selectedServices.includes(svc);
            return (
              <button
                key={svc}
                onClick={() => {
                  if (isSelected) {
                    setSelectedServices(selectedServices.filter((s) => s !== svc));
                  } else {
                    setSelectedServices([...selectedServices, svc]);
                  }
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition border ${
                  isSelected
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-900/40 text-slate-400 border-slate-800/80 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'
                    }`}
                  />
                  <span className="truncate">{svc}</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
              </button>
            );
          })}
        </div>

        {/* Quick RBAC Badge */}
        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/90 mb-5">
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="text-slate-400">Current Role:</span>
            <span className="font-bold uppercase text-indigo-400">
              {currentUser?.role || 'VIEWER'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mb-2 leading-relaxed">
            {currentUser?.role === 'admin'
              ? 'Full cluster & user administration'
              : currentUser?.role === 'operator'
              ? 'Chaos testing & operational triggers'
              : 'Read-only real-time metrics'}
          </span>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 text-[11px] font-mono transition"
          >
            Switch Role
          </button>
        </div>

        {/* Quick Chaos Burst trigger */}
        <div className="mt-auto p-3 rounded-xl bg-rose-950/20 border border-rose-900/40">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-rose-300 mb-1">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Chaos Quick Burst</span>
          </div>
          <p className="text-[10px] text-slate-400 mb-2 leading-tight">
            Trigger a 3.5x burst to test Redis pub/sub distribution.
          </p>
          <button
            onClick={() => setActiveTab('chaos')}
            className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold transition"
          >
            Open Chaos Lab
          </button>
        </div>
      </aside>

      {/* 3. MAIN CENTER CANVAS */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Bar with Live State */}
        <header className="px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/50 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold tracking-tight text-white capitalize">
              {activeTab === 'metrics'
                ? 'Real-Time Telemetry Stream'
                : activeTab === 'inspector'
                ? 'Zero-Drop Packet Verification'
                : activeTab === 'chaos'
                ? 'Distributed Chaos Engineering'
                : 'Cluster Node Diagnostics'}
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {effectiveServices.length} Clusters Monitored
            </span>
          </div>

          <ConnectionStatus
            state={connectionState}
            activeNode={activeNode}
            eventRate={eventRate}
            stats={stats}
            onReconnect={manualReconnect}
          />
        </header>

        {/* View Tabs Content */}
        <div className="p-6 space-y-6">
          {activeTab === 'metrics' && (
            <>
              {/* Filter controls */}
              <TimeRangeFilter
                timeWindow={timeWindow}
                onTimeWindowChange={setTimeWindow}
                metricType={metricFilter}
                onMetricTypeChange={setMetricFilter}
                isPaused={isPaused}
                onTogglePause={() => setIsPaused(!isPaused)}
              />

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {effectiveServices.flatMap((svc) => {
                  const serviceMetrics = metricsByService[svc] || {};
                  const names = Object.keys(serviceMetrics).filter(
                    (n) => metricFilter === 'all' || n === metricFilter
                  );

                  if (names.length === 0) {
                    const fallbackNames =
                      metricFilter === 'all' ? ['cpu_percent', 'request_rate'] : [metricFilter];
                    return fallbackNames.map((n) => (
                      <MetricCard key={`${svc}-${n}`} service={svc} metricName={n} events={[]} />
                    ));
                  }

                  return names.map((name) => (
                    <MetricCard
                      key={`${svc}-${name}`}
                      service={svc}
                      metricName={name}
                      events={serviceMetrics[name] || []}
                    />
                  ));
                })}
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {(metricFilter === 'all' || metricFilter === 'cpu_percent') && (
                  <MetricsChart
                    title="CPU Utilization by Service"
                    metricName="cpu_percent"
                    unit="%"
                    services={effectiveServices}
                    metricsByService={metricsByService}
                  />
                )}

                {(metricFilter === 'all' || metricFilter === 'request_rate') && (
                  <MetricsChart
                    title="Traffic & Throughput Velocity"
                    metricName="request_rate"
                    unit="req/s"
                    services={effectiveServices}
                    metricsByService={metricsByService}
                  />
                )}

                {(metricFilter === 'all' || metricFilter === 'latency_ms') && (
                  <MetricsChart
                    title="End-to-End Latency Profile"
                    metricName="latency_ms"
                    unit="ms"
                    services={effectiveServices}
                    metricsByService={metricsByService}
                  />
                )}

                {(metricFilter === 'all' || metricFilter === 'error_rate') && (
                  <MetricsChart
                    title="Error Rate"
                    metricName="error_rate"
                    unit="%"
                    services={effectiveServices}
                    metricsByService={metricsByService}
                  />
                )}
              </div>

              {/* Monotonic Ingestion Feed */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-semibold text-slate-200">
                      Live Packet Log (Monotonic Wire Sequence)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Latest {latestEvents.length} frames
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="pb-2">Seq</th>
                        <th className="pb-2">Node</th>
                        <th className="pb-2">Service</th>
                        <th className="pb-2">Metric</th>
                        <th className="pb-2">Value</th>
                        <th className="pb-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {latestEvents.slice(0, 7).map((e) => (
                        <tr key={e.id} className="hover:bg-slate-800/20">
                          <td className="py-1.5 text-cyan-400 font-semibold">#{e.seq_id}</td>
                          <td className="py-1.5 text-slate-400 uppercase">{e.node_id}</td>
                          <td className="py-1.5 text-slate-200">{e.service}</td>
                          <td className="py-1.5 text-indigo-300">{e.name}</td>
                          <td className="py-1.5 text-white font-bold">
                            {e.value.toFixed(2)} {e.unit}
                          </td>
                          <td className="py-1.5 text-slate-500">
                            {new Date(e.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'inspector' && (
            <div className="space-y-6">
              <ZeroDropInspector
                stats={stats}
                recentEvents={latestEvents}
                onManualGapRecovery={manualReconnect}
              />
            </div>
          )}

          {activeTab === 'chaos' && (
            <div className="space-y-6">
              <ChaosControls
                userRole={currentUser?.role || 'viewer'}
                token={authToken}
              />
            </div>
          )}

          {activeTab === 'cluster' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Go Hub Node Info */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Go Backend Hub Status</h3>
                </div>
                <div className="space-y-3 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Connected Node ID</span>
                    <span className="text-cyan-400 font-bold uppercase">{activeNode}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Total Dispatched Events</span>
                    <span className="text-white font-bold">
                      {health?.total_events_dispatched?.toLocaleString() || stats.receivedCount}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Connected WebSocket Clients</span>
                    <span className="text-indigo-400 font-bold">
                      {health?.connected_ws_clients ?? 1}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Hub Uptime</span>
                    <span className="text-emerald-400 font-bold">
                      {health ? formatUptime(health.uptime_seconds) : 'Active'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Redis & Postgres Backplane */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Distributed Backplane & Storage</h3>
                </div>
                <div className="space-y-3 text-xs font-mono">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Redis Pub/Sub Channel</span>
                    <span className="text-cyan-400 font-bold">telemetry:events</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Pub/Sub Status</span>
                    <span className="text-emerald-400 font-bold capitalize">
                      {health?.redis_status || 'connected'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">PostgreSQL History</span>
                    <span className="text-indigo-400 font-bold capitalize">
                      {health?.database_status || 'in-memory active'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-400">Zero-Drop SLA Enforced</span>
                    <span className="text-emerald-400 font-bold">TRUE (Active)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RBAC Modal */}
      <RoleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />
    </div>
  );
}
