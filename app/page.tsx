'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { Client, ClientType } from '@/lib/types';
import { exportToCSV, todayDDMMYYYY } from '@/lib/utils';
import ClientList from '@/components/ClientList';
import MeetingPlanner from '@/components/MeetingPlanner';
import AddClientModal from '@/components/AddClientModal';
import { RefreshCw, Download, AlertCircle, CalendarDays, X, Plus } from 'lucide-react';

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

export default function Home() {
  // ── Filter state ───────────────────────────────────────────────────────────
  const [cityFilter, setCityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | ClientType>('All');
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: allClients = [], isLoading, error, mutate } = useSWR<Client[]>(
    '/api/clients',
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  );

  // ── Unique cities for datalist ─────────────────────────────────────────────
  const uniqueCities = useMemo(
    () => Array.from(new Set(allClients.map((c) => c.city).filter(Boolean))).sort(),
    [allClients],
  );

  // ── Filtered clients (client-side, instant) ────────────────────────────────
  const filteredClients = useMemo<Client[]>(() => {
    const cityLower = cityFilter.trim().toLowerCase();
    return allClients.filter((c) => {
      if (cityLower && !c.city.toLowerCase().includes(cityLower)) return false;
      if (typeFilter !== 'All' && c.type !== typeFilter) return false;
      if (highPriorityOnly && c.priority !== 'High') return false;
      return true;
    });
  }, [allClients, cityFilter, typeFilter, highPriorityOnly]);

  const hasActiveFilters = cityFilter.trim() !== '' || typeFilter !== 'All' || highPriorityOnly;

  const clearFilters = useCallback(() => {
    setCityFilter('');
    setTypeFilter('All');
    setHighPriorityOnly(false);
  }, []);

  const handleRefresh = useCallback(() => {
    mutate(fetcher('/api/clients?bust=1'), { revalidate: false });
  }, [mutate]);

  // ── Met Today ──────────────────────────────────────────────────────────────
  const handleMetToday = useCallback(async (client: Client) => {
    const res = await fetch('/api/update-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: client.name, updates: { lastMet: todayDDMMYYYY() } }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? `Update failed (${res.status})`);
    }
    // Force re-fetch so the list reflects the new date
    await mutate(fetcher('/api/clients?bust=1'), { revalidate: false });
  }, [mutate]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 text-white shrink-0">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Client Location Intelligence</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {isLoading
              ? 'Loading data…'
              : error
              ? 'Error loading data'
              : `${allClients.length} clients · Investment Banking`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddClientOpen(true)}
            className="flex items-center gap-1.5 text-xs bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Client
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {String((error as Error).message ?? error)}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        {/* City search */}
        <div className="relative">
          <input
            list="city-options"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            placeholder="Filter by city…"
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <datalist id="city-options">
            {uniqueCities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
          {(['All', 'Fund', 'Company'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 transition-colors ${
                typeFilter === t
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* High priority toggle */}
        <button
          onClick={() => setHighPriorityOnly((p) => !p)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            highPriorityOnly
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          High priority only
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}

        {/* Spacer + stats + actions */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{filteredClients.length}</span>
            {hasActiveFilters && ` of ${allClients.length}`} clients
          </span>
          {filteredClients.length > 0 && (
            <>
              <button
                onClick={() => setPlannerOpen(true)}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Meeting Plan
              </button>
              <button
                onClick={() => exportToCSV(filteredClients)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Full-width list ── */}
      <main className="flex-1 overflow-y-auto">
        <ClientList
          clients={filteredClients}
          isLoading={isLoading && allClients.length === 0}
          onMetToday={handleMetToday}
        />
      </main>

      {/* ── Meeting Planner Modal ── */}
      {plannerOpen && (
        <MeetingPlanner
          clients={filteredClients}
          cityLabel={cityFilter.trim() || 'All Cities'}
          onClose={() => setPlannerOpen(false)}
        />
      )}

      {/* ── Add Client Modal ── */}
      {addClientOpen && (
        <AddClientModal
          onClose={() => setAddClientOpen(false)}
          onAdded={() => mutate(fetcher('/api/clients?bust=1'), { revalidate: false })}
        />
      )}
    </div>
  );
}
