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

// ── Persistent geocode cache (survives warm serverless restarts) ─────────────
const GEO_CACHE_FILE = path.join(os.tmpdir(), 'cl-geocode-cache.json');

function loadDiskGeoCache(): Record<string, [number, number]> {
  try { return JSON.parse(fs.readFileSync(GEO_CACHE_FILE, 'utf-8')); } catch { return {}; }
}
function saveDiskGeoCache(cache: Record<string, [number, number]>) {
  try { fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify(cache)); } catch {}
}

// Initialise disk cache into memory once at module load
const diskGeoCache = loadDiskGeoCache();
for (const [k, v] of Object.entries(diskGeoCache)) {
  setCache(k, v);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

async function geocodeCity(
  city: string,
  country: string,
  apiKey: string,
): Promise<[number, number] | null> {
  const cacheKey = `geo:${city.toLowerCase()}:${country.toLowerCase()}`;
  const cached = getCache<[number, number]>(cacheKey, 30 * 24 * 60 * 60 * 1000); // 30 days
  if (cached) return cached;

  try {
    const q = encodeURIComponent(`${city}, ${country}`);
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${q}&key=${apiKey}&limit=1&no_annotations=1`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.results?.[0]) {
      const { lat, lng } = json.results[0].geometry;
      const coords: [number, number] = [lng, lat];
      setCache(cacheKey, coords);
      // Persist to disk so future cold starts don't re-geocode
      diskGeoCache[cacheKey] = coords;
      saveDiskGeoCache(diskGeoCache);
      return coords;
    }
  } catch (err) {
    console.error(`Geocoding failed for "${city}, ${country}":`, err);
  }
  return null;
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
  const geocodeKey = process.env.OPENCAGE_API_KEY ?? '';

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

    // Geocode unique city+country combos in parallel batches of 5
    const uniqueKeys = Array.from(
      new Set(rows.map((r: RawClient) => `${r.city?.trim()}|||${r.country?.trim()}`)),
    ) as string[];
    const geoMap = new Map<string, [number, number] | null>();

    for (let i = 0; i < uniqueKeys.length; i += 5) {
      await Promise.all(
        uniqueKeys.slice(i, i + 5).map(async (key: string) => {
          const [city, country] = key.split('|||');
          geoMap.set(key, geocodeKey ? await geocodeCity(city, country, geocodeKey) : null);
        }),
      );
    }

    const clients: Client[] = rows
      .map((row: RawClient, idx: number) => {
        const city = row.city?.trim() ?? '';
        const country = row.country?.trim() ?? '';
        // "last met" header varies by how the sheet spells it after lowercasing
        const rawLastMet = row['last met'] ?? row.lastmet ?? row.last_met;
        return {
          id: `c-${idx}`,
          name: row.name?.trim() ?? '',
          type: (row.type?.trim() === 'Fund' ? 'Fund' : 'Company') as 'Fund' | 'Company',
          city,
          country,
          notes: row.notes?.trim() ?? '',
          priority: parsePriority(row.priority),
          lastMet: parseDate(rawLastMet),
          coverage: row.coverage?.trim() ?? '',
          coordinates: geoMap.get(`${city}|||${country}`) ?? null,
        };
      })
      .filter((c: Client) => c.name);

    setCache('all-clients', clients);
    return NextResponse.json(clients);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
