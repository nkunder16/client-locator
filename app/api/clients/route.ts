import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Client, RawClient, Priority } from '@/lib/types';

// ── In-memory cache ──────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number }
const memCache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string, ttlMs: number): T | null {
  const e = memCache.get(key) as CacheEntry<T> | undefined;
  if (!e || Date.now() - e.ts > ttlMs) return null;
  return e.data;
}
function setCache<T>(key: string, data: T) {
  memCache.set(key, { data, ts: Date.now() });
}

// ── Persistent geocode cache (/tmp survives warm serverless restarts) ─────────
const GEO_CACHE_FILE = path.join(os.tmpdir(), 'cl-geocode-cache.json');

function loadDiskGeoCache(): Record<string, [number, number]> {
  try { return JSON.parse(fs.readFileSync(GEO_CACHE_FILE, 'utf-8')); } catch { return {}; }
}
function saveDiskGeoCache(cache: Record<string, [number, number]>) {
  try { fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify(cache)); } catch {}
}

const diskGeoCache = loadDiskGeoCache();
for (const [k, v] of Object.entries(diskGeoCache)) {
  setCache(k, v as [number, number]);
}

// ── Geocoding provider helpers ────────────────────────────────────────────────

async function geocodeWithGoogle(query: string, apiKey: string): Promise<[number, number] | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status === 'OK' && json.results?.[0]) {
    const { lat, lng } = json.results[0].geometry.location;
    return [lng, lat];
  }
  if (json.status && json.status !== 'ZERO_RESULTS') {
    console.warn(`Google Geocoding: ${json.status} for "${query}"`);
  }
  return null;
}

async function geocodeWithOpenCage(query: string, apiKey: string): Promise<[number, number] | null> {
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${apiKey}&limit=1&no_annotations=1`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.results?.[0]) {
    const { lat, lng } = json.results[0].geometry;
    return [lng, lat];
  }
  return null;
}

/**
 * Geocode any free-text query (address OR "city, country").
 * Prefers Google Maps API; falls back to OpenCage; returns null if neither is configured.
 * Results are cached in memory + disk for 30 days to avoid duplicate API calls.
 */
async function geocodeQuery(
  query: string,
  cacheKey: string,
  googleKey: string,
  opencageKey: string,
): Promise<[number, number] | null> {
  const cached = getCache<[number, number]>(cacheKey, 30 * 24 * 60 * 60 * 1000);
  if (cached) return cached;

  let coords: [number, number] | null = null;
  try {
    if (googleKey) {
      coords = await geocodeWithGoogle(query, googleKey);
    } else if (opencageKey) {
      coords = await geocodeWithOpenCage(query, opencageKey);
    }
  } catch (err) {
    console.error(`Geocoding failed for "${query}":`, err);
  }

  if (coords) {
    setCache(cacheKey, coords);
    diskGeoCache[cacheKey] = coords;
    saveDiskGeoCache(diskGeoCache);
  }
  return coords;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePriority(val?: string): Priority {
  const v = val?.trim().toLowerCase();
  if (v === 'high') return 'High';
  if (v === 'medium' || v === 'med') return 'Medium';
  return 'Low';
}

function parseDate(val?: string): string | null {
  if (!val?.trim()) return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Cache key for a row: address-level when address present, city-level otherwise. */
function rowCacheKey(address: string, city: string, country: string): string {
  return address
    ? `addr:${address.toLowerCase()}`
    : `city:${city.toLowerCase()}:${country.toLowerCase()}`;
}

/** Geocoding query string for a row. */
function rowGeoQuery(address: string, city: string, country: string): string {
  return address || `${city}, ${country}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bust = searchParams.get('bust') === '1';

  if (!bust) {
    const cached = getCache<Client[]>('all-clients', 5 * 60 * 1000);
    if (cached) return NextResponse.json(cached);
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetGid = process.env.GOOGLE_SHEET_GID ?? '0';
  const googleKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
  const opencageKey = process.env.OPENCAGE_API_KEY ?? '';

  if (!sheetId) {
    return NextResponse.json(
      { error: 'GOOGLE_SHEET_ID is not configured. See .env.local.example.' },
      { status: 500 },
    );
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      throw new Error(
        `Google Sheets returned ${csvRes.status}. Make sure the sheet is shared as "Anyone with the link can view".`,
      );
    }
    const csvText = await csvRes.text();

    const { data: rows } = Papa.parse<RawClient>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase(),
    });

    // Build a deduplicated map of cacheKey → geoQuery
    const geoTasks = new Map<string, string>();
    for (const row of rows as RawClient[]) {
      const address = row.address?.trim() ?? '';
      const city = row.city?.trim() ?? '';
      const country = row.country?.trim() ?? '';
      const key = rowCacheKey(address, city, country);
      if (!geoTasks.has(key)) {
        geoTasks.set(key, rowGeoQuery(address, city, country));
      }
    }

    // Geocode all unique tasks in parallel batches of 5
    const geoMap = new Map<string, [number, number] | null>();
    const taskEntries = Array.from(geoTasks.entries());

    for (let i = 0; i < taskEntries.length; i += 5) {
      await Promise.all(
        taskEntries.slice(i, i + 5).map(async ([key, query]: [string, string]) => {
          geoMap.set(
            key,
            googleKey || opencageKey
              ? await geocodeQuery(query, key, googleKey, opencageKey)
              : null,
          );
        }),
      );
    }

    const clients: Client[] = (rows as RawClient[])
      .map((row: RawClient, idx: number) => {
        const address = row.address?.trim() ?? '';
        const city = row.city?.trim() ?? '';
        const country = row.country?.trim() ?? '';
        const rawLastMet = row['last met'] ?? row.lastmet ?? row.last_met;
        const key = rowCacheKey(address, city, country);
        return {
          id: `c-${idx}`,
          name: row.name?.trim() ?? '',
          type: (row.type?.trim() === 'Fund' ? 'Fund' : 'Company') as 'Fund' | 'Company',
          city,
          country,
          address,
          notes: row.notes?.trim() ?? '',
          priority: parsePriority(row.priority),
          lastMet: parseDate(rawLastMet),
          coverage: row.coverage?.trim() ?? '',
          coordinates: geoMap.get(key) ?? null,
        };
      })
      .filter((c: Client) => c.name);

    setCache('all-clients', clients);
    return NextResponse.json(clients);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
