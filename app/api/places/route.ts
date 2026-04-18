import { NextRequest, NextResponse } from 'next/server';

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q');
  const placeId = searchParams.get('place_id');

  if (!MAPS_KEY) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 });
  }

  if (placeId) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,geometry&key=${MAPS_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    return NextResponse.json(await res.json());
  }

  if (q && q.trim().length >= 2) {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=establishment&key=${MAPS_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    return NextResponse.json(await res.json());
  }

  return NextResponse.json({ predictions: [] });
}
