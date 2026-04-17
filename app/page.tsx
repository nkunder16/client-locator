'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { Client, ClientType, SearchCenter } from '@/lib/types';
import { haversineDistance, smartSort, exportToCSV } from '@/lib/utils';
import SearchBar from '@/components/SearchBar';
import Filters from '@/components/Filters';
import ClientList from '@/components/ClientList';
import MeetingPlanner from '@/components/MeetingPlanner';
import { RefreshCw, Download, AlertCircle, CalendarDays, X, Star } from 'lucide-react';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-100">
      <div className="text-slate-400 text-sm">Loading map…</div>
    </div>
  ),
});

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

const CITY_RADIUS_KM = 30;

export default function Home() {
  // ── Search state ───────────────────────────────────────────────────────────
  const [searchCenters, setSearchCenters] = useState<SearchCenter[]>([]);
  const [tripMode, setTripMode] = useState(false);
  const [radius, setRadius] = useState(0);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<'All' | ClientType>('All');
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [favoriteCities, setFavoriteCities] = useState<SearchCenter[]>([]);
  const [plannerOpen, setPlannerOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('favoriteCities');
      if (stored) setFavoriteCities(JSON.parse(stored));
    } catch {}
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: allClients = [], isLoading, error, mutate } = useSWR<Client[]>(
    '/api/clients',
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  );

  // ── Derived: filtered + sorted clients ────────────────────────────────────
  const filteredClients = useMemo<Client[]>(() => {
    if (searchCenters.length === 0) return [];
    const effectiveRadius = radius === 0 ? CITY_RADIUS_KM : radius;

    const withDistance = allClients
      .filter((c) => c.coordinates !== null)
      .map((c) => {
        const distances = searchCenters.map((sc) =>
          haversineDistance(sc.coordinates, c.coordinates!),
        );
        return { ...c, distance: Math.min(...distances) };
      })
      .filter((c) => {
        const inRange = c.distance <= effectiveRadius;
        const typeOk = typeFilter === 'All' || c.type === typeFilter;
        return inRange && typeOk;
      });

    return smartSort(withDistance);
  }, [allClients, searchCenters, radius, typeFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = useCallback(
    (center: SearchCenter) => {
      setSearchCenters((prev) => {
        if (tripMode) {
          if (prev.some((c) => c.city === center.city && c.country === center.country))
            return prev;
          return [...prev, center];
        }
        return [center];
      });
      setSelectedClientId(null);
    },
    [tripMode],
  );

  const removeCity = useCallback((city: string) => {
    setSearchCenters((prev) => prev.filter((c) => c.city !== city));
  }, []);

  const handleClientSelect = useCallback((client: Client) => {
    setSelectedClientId(client.id);
  }, []);

  const handleAddFavorite = useCallback(
    (center: SearchCenter) => {
      setFavoriteCities((prev) => {
        if (prev.some((f) => f.city === center.city && f.country === center.country)) return prev;
        const updated = [...prev, center].slice(-8);
        localStorage.setItem('favoriteCities', JSON.stringify(updated));
        return updated;
      });
    },
    [],
  );

  const handleRefresh = useCallback(() => {
    mutate(fetcher('/api/clients?bust=1'), { revalidate: false });
  }, [mutate]);

  const handleTripModeToggle = useCallback((on: boolean) => {
    setTripMode(on);
    if (!on && searchCenters.length > 1) {
      // Keep only the first city when leaving trip mode
      setSearchCenters((prev) => prev.slice(0, 1));
    }
  }, [searchCenters.length]);

  // ── Map clients: all (world view) or filtered ─────────────────────────────
  const mapClients = searchCenters.length > 0
    ? filteredClients
    : allClients.filter((c) => c.coordinates);

  // ── City chips label for planner ──────────────────────────────────────────
  const cityLabel = searchCenters.map((c) => c.city).join(' · ') || 'All Cities';

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
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-700 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {String((error as Error).message ?? error)}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-96 flex flex-col bg-white border-r border-slate-200 shrink-0 overflow-hidden">
          {/* Search + Filters */}
          <div className="p-4 space-y-3 border-b border-slate-100">
            <SearchBar
              onSearch={handleSearch}
              favoriteCities={favoriteCities}
              onAddFavorite={() => {
                if (searchCenters[searchCenters.length - 1])
                  handleAddFavorite(searchCenters[searchCenters.length - 1]);
              }}
              currentCity={searchCenters[searchCenters.length - 1]?.displayName}
            />

            {/* Trip mode city chips */}
            {searchCenters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {searchCenters.map((sc) => (
                  <span
                    key={sc.city + sc.country}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                      tripMode
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {sc.city}
                    {tripMode && (
                      <button
                        onClick={() => removeCity(sc.city)}
                        className="text-blue-400 hover:text-blue-700 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {!tripMode && (
                      <button
                        onClick={() => handleAddFavorite(sc)}
                        className="text-slate-400 hover:text-amber-500 ml-0.5"
                        title="Save to favourites"
                      >
                        <Star className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <Filters
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
              radius={radius}
              onRadiusChange={setRadius}
              highPriorityOnly={highPriorityOnly}
              onHighPriorityToggle={setHighPriorityOnly}
              tripMode={tripMode}
              onTripModeToggle={handleTripModeToggle}
            />
          </div>

          {/* Result summary */}
          {searchCenters.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 shrink-0">
              <span className="font-semibold text-slate-800">{filteredClients.length}</span>{' '}
              client{filteredClients.length !== 1 ? 's' : ''}{' '}
              {radius > 0 ? <>within <span className="font-medium">{radius} km</span> of </> : 'in '}
              <span className="font-medium">{cityLabel}</span>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            <ClientList
              clients={filteredClients}
              selectedClientId={selectedClientId}
              onClientSelect={handleClientSelect}
              isLoading={isLoading && allClients.length === 0}
              highPriorityOnly={highPriorityOnly}
            />
          </div>

          {/* Footer actions */}
          {filteredClients.length > 0 && (
            <div className="p-3 border-t border-slate-100 shrink-0 flex gap-2">
              <button
                onClick={() => setPlannerOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-medium transition-colors"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Meeting Plan
              </button>
              <button
                onClick={() => exportToCSV(filteredClients)}
                className="flex-1 flex items-center justify-center gap-2 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg py-2 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          )}
        </aside>

        {/* ── Map ── */}
        <main className="flex-1 relative">
          {searchCenters.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-xl text-center max-w-xs">
                <div className="text-3xl mb-3">🗺️</div>
                <h2 className="font-semibold text-slate-800 text-lg">Search a City</h2>
                <p className="text-slate-500 text-sm mt-1">
                  {tripMode
                    ? 'Add multiple cities to plan a trip across locations.'
                    : 'Enter a city to find nearby clients on the map.'}
                </p>
                {allClients.length > 0 && (
                  <p className="text-slate-400 text-xs mt-3">
                    {allClients.length} clients loaded
                  </p>
                )}
              </div>
            </div>
          )}

          <Map
            clients={mapClients}
            searchCenters={searchCenters}
            radius={radius}
            selectedClientId={selectedClientId}
            onClientSelect={handleClientSelect}
          />
        </main>
      </div>

      {/* ── Meeting Planner Modal ── */}
      {plannerOpen && (
        <MeetingPlanner
          clients={filteredClients}
          cityLabel={cityLabel}
          onClose={() => setPlannerOpen(false)}
        />
      )}
    </div>
  );
}
