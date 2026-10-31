'use client';

import React from 'react';
import { Layers } from 'lucide-react';

interface ServiceFilterProps {
  availableServices: string[];
  selectedServices: string[];
  onChange: (services: string[]) => void;
}

export function ServiceFilter({
  availableServices,
  selectedServices,
  onChange,
}: ServiceFilterProps) {
  const isAllSelected = selectedServices.length === 0;

  const handleToggle = (service: string) => {
    if (service === 'ALL') {
      onChange([]);
      return;
    }

    if (selectedServices.includes(service)) {
      const updated = selectedServices.filter((s) => s !== service);
      onChange(updated);
    } else {
      onChange([...selectedServices, service]);
    }
  };

  const getServiceColor = (service: string, isSelected: boolean) => {
    if (!isSelected) return 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700';

    switch (service) {
      case 'api-gateway':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/20';
      case 'auth-service':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/50 shadow-sm shadow-indigo-500/20';
      case 'payment-service':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20';
      case 'order-worker':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20';
      default:
        return 'bg-purple-500/15 text-purple-300 border-purple-500/50 shadow-sm shadow-purple-500/20';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mr-1">
        <Layers className="w-4 h-4 text-slate-500" />
        <span>Services:</span>
      </div>

      {/* ALL Filter */}
      <button
        onClick={() => handleToggle('ALL')}
        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
          isAllSelected
            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm shadow-blue-500/20'
            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
        }`}
      >
        All Clusters ({availableServices.length})
      </button>

      {/* Specific Services */}
      {availableServices.map((service) => {
        const isSelected = selectedServices.includes(service);
        return (
          <button
            key={service}
            onClick={() => handleToggle(service)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${getServiceColor(
              service,
              isSelected
            )}`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-80" />
            {service}
          </button>
        );
      })}
    </div>
  );
}
