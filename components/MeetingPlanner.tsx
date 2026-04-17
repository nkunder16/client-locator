'use client';

import { useMemo, useState } from 'react';
import { X, Copy, Download, Check, CalendarDays } from 'lucide-react';
import { Client, Priority } from '@/lib/types';
import { meetingPlanScore, formatLastMet, exportToCSV } from '@/lib/utils';

interface MeetingPlannerProps {
  clients: Client[];
  cityLabel: string;
  onClose: () => void;
}

const PRIORITY_BADGE: Record<Priority, string> = {
  High: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  Medium: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Low: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
};

function toPlainText(plan: Client[], cityLabel: string): string {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const lines: string[] = [
    `MEETING PLAN — ${cityLabel}`,
    `Generated: ${date}`,
    '─'.repeat(48),
    '',
  ];
  plan.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name} (${c.priority} Priority)`);
    lines.push(`   ${c.type} · ${c.city}, ${c.country}`);
    if (c.coverage) lines.push(`   Coverage: ${c.coverage}`);
    lines.push(`   Last met: ${formatLastMet(c.lastMet)}`);
    if (c.distance != null) lines.push(`   Distance: ${Math.round(c.distance)} km`);
    if (c.notes) lines.push(`   Note: ${c.notes}`);
    lines.push('');
  });
  return lines.join('\n');
}

export default function MeetingPlanner({ clients, cityLabel, onClose }: MeetingPlannerProps) {
  const [topN, setTopN] = useState(8);
  const [copied, setCopied] = useState(false);

  const plan = useMemo(
    () =>
      [...clients]
        .map((c) => ({ ...c, _score: meetingPlanScore(c) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, topN),
    [clients, topN],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toPlainText(plan, cityLabel));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              Meeting Plan
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{cityLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <span className="text-xs text-slate-500 font-medium">Show top</span>
          {[5, 8, 10].map((n) => (
            <button
              key={n}
              onClick={() => setTopN(n)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                topN === n ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-white'
              }`}
            >
              {n}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-auto">
            scored by priority · recency · distance
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {plan.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              No clients to plan
            </div>
          ) : (
            plan.map((client, idx) => (
              <div key={client.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-slate-400 w-5 pt-0.5 shrink-0">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 truncate">{client.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[client.priority]}`}>
                        {client.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {client.type} · {client.city}, {client.country}
                    </p>
                    {client.coverage && (
                      <p className="text-xs text-slate-400 mt-0.5">Coverage: {client.coverage}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-slate-400">
                        Last met: <span className="font-medium text-slate-600">{formatLastMet(client.lastMet)}</span>
                      </span>
                      {client.distance != null && (
                        <span className="text-[10px] text-slate-400">
                          {Math.round(client.distance)} km
                        </span>
                      )}
                    </div>
                    {client.notes && (
                      <p className="text-[10px] text-slate-400 italic mt-1">{client.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-lg border font-medium transition-colors ${
              copied
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button
            onClick={() => exportToCSV(plan)}
            className="flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
