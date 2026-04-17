'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Star, X } from 'lucide-react';
import { SearchCenter } from '@/lib/types';

interface SearchBarProps {
  onSearch: (center: SearchCenter) => void;
  favoriteCities: SearchCenter[];
  onAddFavorite: () => void;
  currentCity?: string;
}

export default function SearchBar({
  onSearch,
  favoriteCities,
  onAddFavorite,
  currentCity,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchCenter[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&autocomplete=true`);
      const data = await res.json();
      setSuggestions(data.results ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSelect = (center: SearchCenter) => {
    setQuery(center.displayName);
    setSuggestions([]);
    setOpen(false);
    onSearch(center);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (suggestions[0]) { handleSelect(suggestions[0]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.results?.[0]) handleSelect(data.results[0]);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const showFavorites = open && !query && favoriteCities.length > 0;
  const showSuggestions = open && query.length >= 2;
  const dropdownVisible = showFavorites || showSuggestions;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search city (e.g. Mumbai, London…)"
            className="w-full pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {currentCity && (
          <button
            type="button"
            onClick={onAddFavorite}
            title="Save to favourites"
            className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-200 transition-colors"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
      </form>

      {dropdownVisible && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden divide-y divide-slate-50">
          {showFavorites && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Favourites
              </div>
              {favoriteCities.map((city) => (
                <button
                  key={city.city + city.country}
                  onMouseDown={() => handleSelect(city)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  {city.displayName}
                </button>
              ))}
            </div>
          )}

          {showSuggestions && (
            <div>
              {suggestions.map((s) => (
                <button
                  key={s.displayName}
                  onMouseDown={() => handleSelect(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                >
                  {s.displayName}
                </button>
              ))}
              {loading && (
                <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>
              )}
              {!loading && suggestions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-400">No cities found</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
