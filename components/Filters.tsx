'use client';

import { ClientType } from '@/lib/types';
import { AlertTriangle, Briefcase } from 'lucide-react';

interface FiltersProps {
  typeFilter: 'All' | ClientType;
  onTypeChange: (t: 'All' | ClientType) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
  highPriorityOnly: boolean;
  onHighPriorityToggle: (v: boolean) => void;
  tripMode: boolean;
  onTripModeToggle: (v: boolean) => void;
}

const TYPE_OPTIONS = ['All', 'Fund', 'Company'] as const;

export default function Filters({
  typeFilter,
  onTypeChange,
  radius,
  onRadiusChange,
  highPriorityOnly,
  onHighPriorityToggle,
  tripMode,
  onTripModeToggle,
}: FiltersProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Type toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              className={`px-3 py-1.5 transition-colors ${
                typeFilter === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Radius */}
        <select
          value={radius}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700"
        >
          <option value={0}>City only</option>
          {[25, 50, 100, 200, 500].map((r) => (
            <option key={r} value={r}>{r} km</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* High-priority toggle */}
        <button
          onClick={() => onHighPriorityToggle(!highPriorityOnly)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            highPriorityOnly
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="h-3 w-3" />
          High priority only
        </button>

        {/* Trip mode toggle */}
        <button
          onClick={() => onTripModeToggle(!tripMode)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            tripMode
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Briefcase className="h-3 w-3" />
          Trip mode
        </button>
      </div>
    </div>
  );
}
