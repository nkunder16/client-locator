'use client';

import React, { useState } from 'react';
import {
  ArrowUpDown, TrendingUp, Building2, ChevronDown, ChevronRight,
  ExternalLink, CalendarCheck, Search, Check, Loader2,
} from 'lucide-react';
import { Client, Priority } from '@/lib/types';
import { formatLastMet } from '@/lib/utils';

type SortKey = 'name' | 'type' | 'city' | 'priority' | 'lastMet' | 'coverage';

interface ClientListProps {
  clients: Client[];
  isLoading: boolean;
  onMetToday: (client: Client) => Promise<void>;
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

const PRIORITY_BADGE: Record<Priority, string> = {
  High: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  Medium: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Low: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
};

export default function ClientList({ clients, isLoading, onMetToday }: ClientListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState(new Set<string>());
  const [successIds, setSuccessIds] = useState(new Set<string>());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleMetToday = async (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingIds.has(client.id)) return;
    setLoadingIds((prev) => new Set(prev).add(client.id));
    try {
      await onMetToday(client);
      setSuccessIds((prev) => new Set(prev).add(client.id));
      setTimeout(() => {
        setSuccessIds((prev) => { const s = new Set(prev); s.delete(client.id); return s; });
      }, 2000);
    } finally {
      setLoadingIds((prev) => { const s = new Set(prev); s.delete(client.id); return s; });
    }
  };

  const handleGoogleSearch = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(client.name)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const sorted = [...clients].sort((a: Client, b: Client) => {
    let cmp = 0;
    if (sortKey === 'priority') {
      cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (cmp !== 0) return sortAsc ? cmp : -cmp;
      // Tiebreak by Last Met: oldest first, nulls at bottom
      if (!a.lastMet && !b.lastMet) return 0;
      if (!a.lastMet) return 1;
      if (!b.lastMet) return -1;
      return new Date(a.lastMet).getTime() - new Date(b.lastMet).getTime();
    }
    if (sortKey === 'lastMet') {
      // Nulls at bottom
      if (!a.lastMet && !b.lastMet) cmp = 0;
      else if (!a.lastMet) cmp = 1;
      else if (!b.lastMet) cmp = -1;
      else cmp = new Date(a.lastMet).getTime() - new Date(b.lastMet).getTime();
    } else {
      const av = String((a as unknown as Record<string, unknown>)[sortKey] ?? '').toLowerCase();
      const bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? '').toLowerCase();
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    }
    return sortAsc ? cmp : -cmp;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Loading clients…
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-1">
        <span className="font-medium">No clients match your filters</span>
      </div>
    );
  }

  const Th = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <th className={`px-3 py-2 text-left ${className}`}>
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
          sortKey === field ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
        }`}
      >
        {label}
        <ArrowUpDown className="h-2.5 w-2.5 opacity-70" />
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
          <tr>
            <th className="w-6 px-3 py-2" />
            <Th label="Name" field="name" className="min-w-[180px]" />
            <Th label="Type" field="type" className="w-24" />
            <Th label="City" field="city" className="min-w-[120px]" />
            <Th label="Priority" field="priority" className="w-24" />
            <Th label="Last Met" field="lastMet" className="w-24" />
            <Th label="Coverage" field="coverage" className="min-w-[120px]" />
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-right w-32">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((client) => {
            const isFund = client.type === 'Fund';
            const isExpanded = expandedId === client.id;
            const isMetLoading = loadingIds.has(client.id);
            const isMetSuccess = successIds.has(client.id);

            return (
              <>
                <tr
                  key={client.id}
                  onClick={() => setExpandedId(isExpanded ? null : client.id)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  {/* Expand chevron */}
                  <td className="px-3 py-2.5 text-slate-400">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>

                  {/* Name */}
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-slate-800">{client.name}</span>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isFund ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {isFund ? <TrendingUp className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                      {client.type}
                    </span>
                  </td>

                  {/* City */}
                  <td className="px-3 py-2.5 text-slate-600 text-[13px]">
                    {client.city}{client.country ? `, ${client.country}` : ''}
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[client.priority]}`}>
                      {client.priority}
                    </span>
                  </td>

                  {/* Last Met */}
                  <td className="px-3 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                    {formatLastMet(client.lastMet)}
                  </td>

                  {/* Coverage */}
                  <td className="px-3 py-2.5 text-[12px] text-slate-500">
                    {client.coverage || <span className="text-slate-300">—</span>}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Met Today */}
                      <button
                        onClick={(e) => handleMetToday(client, e)}
                        disabled={isMetLoading}
                        title="Mark as met today"
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-medium border transition-colors ${
                          isMetSuccess
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                        } disabled:opacity-50`}
                      >
                        {isMetLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isMetSuccess ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <CalendarCheck className="h-3 w-3" />
                        )}
                        {isMetSuccess ? 'Saved' : 'Met Today'}
                      </button>

                      {/* Google Search */}
                      <button
                        onClick={(e) => handleGoogleSearch(client, e)}
                        title={`Search "${client.name}" on Google`}
                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {isExpanded && (
                  <tr key={`${client.id}-detail`} className="bg-blue-50/40">
                    <td />
                    <td colSpan={7} className="px-3 py-3">
                      <div className="flex flex-wrap gap-4 text-[12px] text-slate-600">
                        {(client.address || client.city) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Address:</span>
                            <span>{client.address || `${client.city}, ${client.country}`}</span>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                client.address || `${client.name}, ${client.city}, ${client.country}`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Maps
                            </a>
                          </div>
                        )}
                        {client.notes && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-slate-400 shrink-0">Notes:</span>
                            <span>{client.notes}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
