import { NextRequest, NextResponse } from 'next/server';

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface OpenCageResult {
  formatted: string;
  geometry: { lat: number; lng: number };
  components: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    country?: string;
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  const autocomplete = req.nextUrl.searchParams.get('autocomplete') === 'true';

  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  const cacheKey = `${q.toLowerCase()}:${autocomplete}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENCAGE_API_KEY is not configured. See .env.local.example.' },
      { status: 500 },
    );
  }

  try {
    const params = new URLSearchParams({
      q,
      key: apiKey,
      limit: autocomplete ? '6' : '1',
      no_annotations: '1',
      min_confidence: '3',
    });

    const res = await fetch(`https://api.opencagedata.com/geocode/v1/json?${params}`);
    const json = await res.json();

    const results = (json.results ?? []).map((r: OpenCageResult) => ({
      displayName: r.formatted,
      city:
        r.components?.city ||
        r.components?.town ||
        r.components?.village ||
        r.components?.county ||
        q,
      country: r.components?.country ?? '',
      coordinates: [r.geometry.lng, r.geometry.lat] as [number, number],
    }));

    const payload = { results };
    cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
