# Client Location Intelligence

Investment banking client locator — find which funds and companies are in a city or nearby geography.

## Features

- **Live Google Sheets data** — auto-refreshes every 5 minutes
- **Mapbox map** with colour-coded pins (green = Fund, blue = Company)
- **City search** with autocomplete powered by OpenCage
- **Radius expansion** — city-only or up to 500 km
- **Type filter** — All / Funds / Companies
- **Sortable list** alongside the map
- **Favourite cities** (persisted in localStorage)
- **CSV export** of any filtered result set

---

## Quick Start

### 1. Install dependencies

```bash
cd client-locator
npm install
```

### 2. Set up API keys

Copy `.env.local.example` to `.env.local` and fill in the three values:

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | https://account.mapbox.com → Tokens |
| `OPENCAGE_API_KEY` | https://opencagedata.com → free tier (2,500 req/day) |
| `GOOGLE_SHEET_ID` | See step 3 below |

### 3. Connect Google Sheets

#### 3a. Create your sheet

Make a Google Sheet with these **exact column headers** in row 1:

| Name | Type | City | Country | Priority | Last Met | Coverage | Notes |
|---|---|---|---|---|---|---|---|
| Sequoia Capital | Fund | Menlo Park | United States | High | 2025-11-01 | Jane Smith | Tiger cub |
| Goldman Sachs | Company | New York | United States | Medium | 2025-06-15 | John Doe | BB coverage |
| Vanguard | Fund | Malvern | United States | Low | | | Index fund |

Column rules:
- **Type**: exactly `Fund` or `Company` (case-sensitive)
- **Priority**: `High`, `Medium`, or `Low` (defaults to `Low` if blank)
- **Last Met**: any date format — `YYYY-MM-DD`, `DD/MM/YYYY`, `Nov 1 2025`, etc.
- **Coverage**, **Notes**: free text, optional

#### 3b. Make the sheet public

1. Click **Share** → **Change to anyone with the link** → **Viewer**
2. Copy the sheet URL, e.g.:
   `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit`
3. The **Sheet ID** is the long string between `/d/` and `/edit`:
   `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`
4. Paste it as `GOOGLE_SHEET_ID` in `.env.local`

> If you have multiple tabs, set `GOOGLE_SHEET_GID` to the numeric tab ID shown in the URL (`?gid=XXXXXXX`).

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment to Vercel (recommended)

```bash
npm install -g vercel
vercel
```

When prompted, add the three environment variables from `.env.local`.

**Or** connect your GitHub repo to Vercel and add the env vars in **Project Settings → Environment Variables**.

### Deployment to Netlify

```bash
npm run build
```

Set environment variables in **Site Settings → Environment variables**, then deploy the `.next` folder using `@netlify/plugin-nextjs`.

---

## Architecture

```
app/
  page.tsx              # Main page — state, layout, SWR data fetching
  layout.tsx            # Root HTML shell + fonts
  globals.css           # Tailwind + Mapbox popup styles
  api/
    clients/route.ts    # Fetches Google Sheet CSV, geocodes, caches 5 min
    geocode/route.ts    # OpenCage proxy — keeps API key server-side

components/
  Map.tsx               # Mapbox GL JS map — markers, popups, radius circle
  SearchBar.tsx         # City autocomplete input
  Filters.tsx           # Type toggle + radius selector
  ClientList.tsx        # Sortable results table

lib/
  types.ts              # Shared TypeScript interfaces
  utils.ts              # Haversine distance, CSV export
```

**Caching strategy:**
- Google Sheet data: in-memory server cache, 5-minute TTL
- Geocode results: in-memory server cache, 24-hour TTL
- Favourites: browser localStorage

---

## Geocoding & API limits

| Service | Free tier |
|---|---|
| OpenCage | 2,500 requests/day — more than enough for geocoding cities on demand |
| Mapbox | 50,000 map loads/month |

Geocode results are cached permanently per-session on the server, so repeated city searches don't consume quota.

---

## Updating client data

The sheet auto-refreshes every 5 minutes. To force an immediate refresh hit the **Refresh** button in the header (calls `/api/clients?bust=1`).
