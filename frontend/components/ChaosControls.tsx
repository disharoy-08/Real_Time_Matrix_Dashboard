'use client';

import React, { useState } from 'react';
import { Role } from '../types/metrics';
import { triggerChaosSpike } from '../services/metricsApi';
import { Flame, Lock, Zap, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface ChaosControlsProps {
  userRole: Role;
  token?: string;
}

export function ChaosControls({ userRole, token }: ChaosControlsProps) {
  const [targetService, setTargetService] = useState('payment-service');
  const [multiplier, setMultiplier] = useState(3.5);
  const [durationMs, setDurationMs] = useState(5000);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isPermitted = userRole === 'operator' || userRole === 'admin';

  const handleInject = async (svc = targetService, mult = multiplier, dur = durationMs) => {
    if (!isPermitted) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await triggerChaosSpike({
        service: svc,
        multiplier: mult,
        durationMs: dur,
        token,
      });

      setStatusMessage({
        type: 'success',
        text: `🔥 Injected ${mult}x burst on ${svc} (${(dur / 1000).toFixed(1)}s)`,
      });

      // Clear banner after 6 seconds
      setTimeout(() => {
        setStatusMessage(null);
      }, 6000);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Chaos injection failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-4 relative overflow-hidden">
      {/* Background Accent glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">Chaos Injection & Traffic Spikes</h3>
              {!isPermitted && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Lock className="w-3 h-3" />
                  REQUIRES OPERATOR / ADMIN
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Simulate sudden traffic surges to evaluate telemetry fan-out across Redis Pub/Sub
            </p>
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border animate-fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Quick Chaos Presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => handleInject('payment-service', 3.5, 6000)}
          disabled={!isPermitted || isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
            isPermitted
              ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-900/50 hover:border-rose-600'
              : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-rose-400" />
          <span>3.5x Burst (payment-service)</span>
        </button>

        <button
          onClick={() => handleInject('api-gateway', 4.0, 8000)}
          disabled={!isPermitted || isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
            isPermitted
              ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/50 hover:border-amber-600'
              : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>4.0x Surge (api-gateway)</span>
        </button>

        <button
          onClick={() => handleInject('auth-service', 2.5, 5000)}
          disabled={!isPermitted || isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition border ${
            isPermitted
              ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900/50 hover:border-indigo-600'
              : 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
          <span>2.5x Spike (auth-service)</span>
        </button>
      </div>

      {/* Custom Chaos Form */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
        <div>
          <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Cluster</label>
          <select
            value={targetService}
            onChange={(e) => setTargetService(e.target.value)}
            disabled={!isPermitted || isLoading}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          >
            <option value="payment-service">payment-service</option>
            <option value="api-gateway">api-gateway</option>
            <option value="auth-service">auth-service</option>
            <option value="order-worker">order-worker</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-mono text-slate-400 mb-1">Multiplier</label>
          <input
            type="number"
            min="1.5"
            max="10"
            step="0.5"
            value={multiplier}
            onChange={(e) => setMultiplier(parseFloat(e.target.value) || 2)}
            disabled={!isPermitted || isLoading}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-mono text-slate-400 mb-1">Duration (ms)</label>
          <input
            type="number"
            min="1000"
            max="30000"
            step="1000"
            value={durationMs}
            onChange={(e) => setDurationMs(parseInt(e.target.value) || 5000)}
            disabled={!isPermitted || isLoading}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => handleInject()}
            disabled={!isPermitted || isLoading}
            className={`w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold font-mono transition shadow-md ${
              isPermitted
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Flame className="w-3.5 h-3.5" />
            )}
            <span>Inject Chaos</span>
          </button>
        </div>
      </div>
    </div>
  );
}
