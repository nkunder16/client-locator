'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Search, Plus, Trash2, Download, X } from 'lucide-react';
import type { PlottedLocation } from '@/components/LocationMap';

const LocationMap = dynamic(() => import('@/components/LocationMap'), { ssr: false });

const STORAGE_KEY = 'location_plotter_v1';

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

export default function Page() {
  // ── Form ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [formError, setFormError] = useState('');

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Locations ─────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState<PlottedLocation[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLocations(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
  }, [locations]);

  const addLocation = useCallback((loc: Omit<PlottedLocation, 'id'>) => {
    setLocations((prev) => [...prev, { ...loc, id: crypto.randomUUID() }]);
  }, []);

  const deleteLocation = useCallback((id: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ── Manual add ────────────────────────────────────────────────────────────
  const handleManualAdd = () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!name.trim()) { setFormError('Name is required'); return; }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) { setFormError('Latitude must be −90 to 90'); return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { setFormError('Longitude must be −180 to 180'); return; }
    addLocation({ name: name.trim(), latitude: latNum, longitude: lngNum });
    setName(''); setLat(''); setLng(''); setFormError('');
  };

  // ── Search autocomplete ───────────────────────────────────────────────────
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setPredictions([]); setDropdownOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (data.error) { setSearchError(data.error); setPredictions([]); }
        else { setPredictions(data.predictions ?? []); setDropdownOpen(true); }
      } catch {
        setSearchError('Search failed');
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  // ── Select prediction → fetch details → add marker ────────────────────────
  const handleSelectPrediction = async (pred: PlacePrediction) => {
    setSearchQuery('');
    setPredictions([]);
    setDropdownOpen(false);
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await fetch(`/api/places?place_id=${encodeURIComponent(pred.place_id)}`);
      const data = await res.json();
      const loc = data.result;
      if (!loc?.geometry?.location) { setSearchError('Could not retrieve coordinates'); return; }
      const { lat: pLat, lng: pLng } = loc.geometry.location;
      addLocation({ name: pred.structured_formatting.main_text, latitude: pLat, longitude: pLng });
    } catch {
      setSearchError('Failed to fetch place details');
    } finally {
      setSearchLoading(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── CSV export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Name', 'Latitude', 'Longitude'],
      ...locations.map((l) => [l.name, String(l.latitude), String(l.longitude)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `locations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 text-white shrink-0">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Location Plotter</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            {locations.length === 0
              ? 'Plot hospitals & clinics for market mapping'
              : `${locations.length} location${locations.length === 1 ? '' : 's'} plotted`}
          </p>
        </div>
        {locations.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => setLocations([])}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-80 flex flex-col bg-white border-r border-slate-200 shrink-0">

          {/* Manual entry */}
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Add manually
            </h2>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                  placeholder="e.g. St Mary's Hospital"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Latitude</label>
                  <input
                    type="number"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    placeholder="40.7128"
                    step="any"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Longitude</label>
                  <input
                    type="number"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    placeholder="-74.0060"
                    step="any"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <X className="h-3 w-3 shrink-0" />{formError}
                </p>
              )}

              <button
                onClick={handleManualAdd}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Location
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-slate-100" ref={searchRef}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Search by name
            </h2>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => predictions.length > 0 && setDropdownOpen(true)}
                  placeholder="Search hospital or clinic…"
                  className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {dropdownOpen && predictions.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  {predictions.map((p) => (
                    <button
                      key={p.place_id}
                      onClick={() => handleSelectPrediction(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {p.structured_formatting.main_text}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {p.structured_formatting.secondary_text}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {searchError && (
              <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                <X className="h-3 w-3 shrink-0" />{searchError}
              </p>
            )}
          </div>

          {/* Location list */}
          <div className="flex-1 p-4 overflow-y-auto">
            {locations.length === 0 ? (
              <div className="text-center py-10">
                <MapPin className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No locations yet</p>
                <p className="text-xs text-slate-300 mt-1">Add using the form above or search</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Plotted ({locations.length})
                </p>
                <ul className="space-y-1.5">
                  {locations.map((loc) => (
                    <li
                      key={loc.id}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 group transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{loc.name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteLocation(loc.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0"
                        title="Delete"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <LocationMap locations={locations} onDelete={deleteLocation} />
          {locations.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 backdrop-blur-sm rounded-xl px-6 py-4 text-center shadow-sm border border-slate-100">
                <MapPin className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">Add locations to begin mapping</p>
                <p className="text-xs text-slate-400 mt-0.5">Use the panel on the left</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
