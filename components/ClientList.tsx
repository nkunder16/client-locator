'use client';

import { useState } from 'react';
import { ArrowUpDown, TrendingUp, Building2, MapPin } from 'lucide-react';
import { Client, Priority } from '@/lib/types';
import { formatLastMet } from '@/lib/utils';

type SortKey = 'name' | 'type' | 'city' | 'distance' | 'priority' | 'lastMet';

interface ClientListProps {
  clients: Client[];
  selectedClientId: string | null;
  onClientSelect: (client: Client) => void;
  isLoading: boolean;
  highPriorityOnly: boolean;
}

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

const PRIORITY_DOT: Record<Priority, string> = {
  High: 'bg-red-500',
  Medium: 'bg-orange-400',
  Low: 'bg-slate-300',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  High: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  Medium: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Low: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200',
};

export default function ClientList({
  clients,
  selectedClientId,
  onClientSelect,
  isLoading,
  highPriorityOnly,
}: ClientListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const visible = highPriorityOnly ? clients.filter((c) => c.priority === 'High') : clients;

  const sorted = [...visible].sort((a: Client, b: Client) => {
    let cmp = 0;
    if (sortKey === 'priority') {
      cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    } else if (sortKey === 'distance') {
      cmp = (a.distance ?? Infinity) - (b.distance ?? Infinity);
    } else if (sortKey === 'lastMet') {
      if (!a.lastMet && !b.lastMet) cmp = 0;
      else if (!a.lastMet) cmp = -1;
      else if (!b.lastMet) cmp = 1;
      else cmp = new Date(a.lastMet).getTime() - new Date(b.lastMet).getTime();
    } else {
      const ra = a as unknown as Record<string, unknown>;
      const rb = b as unknown as Record<string, unknown>;
      const av = String(ra[sortKey] ?? '').toLowerCase();
      const bv = String(rb[sortKey] ?? '').toLowerCase();
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
      <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
        <MapPin className="h-6 w-6 opacity-40" />
        <span>Search a city to see clients</span>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-1">
        <span className="font-medium">No high-priority clients here</span>
        <span className="text-xs">Turn off the filter to see all {clients.length}</span>
      </div>
    );
  }

  const Th = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        sortKey === field ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
      }`}
    >
      {label}
      <ArrowUpDown className="h-2.5 w-2.5 opacity-70" />
    </button>
  );

  return (
    <div className="divide-y divide-slate-50">
      {/* Sticky header */}
      <div className="grid grid-cols-[12px_1fr_62px_44px] gap-x-2 px-4 py-2 bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
        <Th label="" field="priority" />
        <Th label="Name" field="name" />
        <Th label="Last Met" field="lastMet" />
        <Th label="Dist." field="distance" />
      </div>

      {sorted.map((client) => {
        const isFund = client.type === 'Fund';
        const isSelected = client.id === selectedClientId;

        return (
          <button
            key={client.id}
            onClick={() => onClientSelect(client)}
            className={[
              'w-full grid grid-cols-[12px_1fr_62px_44px] gap-x-2 px-4 py-2.5 text-left',
              'hover:bg-blue-50 transition-colors',
              isSelected ? 'bg-blue-50 border-l-[3px] border-l-blue-500 pl-[13px]' : '',
            ].join(' ')}
          >
            {/* Priority dot */}
            <div className="flex items-center pt-1">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[client.priority]}`}
                title={client.priority}
              />
            </div>

            {/* Name + meta */}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate leading-snug">
                {client.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    isFund ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                  }`}
                >
                  {isFund ? <TrendingUp className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                  {client.type}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[client.priority]}`}>
                  {client.priority}
                </span>
                {client.coverage && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                    {client.coverage}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                {client.city}, {client.country}
              </p>
            </div>

            {/* Last Met */}
            <div className="text-[10px] text-slate-400 pt-0.5 whitespace-nowrap">
              {formatLastMet(client.lastMet)}
            </div>

            {/* Distance */}
            <div className="text-[10px] text-slate-400 pt-0.5 whitespace-nowrap text-right">
              {client.distance != null ? `${Math.round(client.distance)}km` : '—'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
