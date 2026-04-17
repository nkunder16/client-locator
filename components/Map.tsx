'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Client, SearchCenter, Priority } from '@/lib/types';
import { formatLastMet } from '@/lib/utils';

interface MapProps {
  clients: Client[];
  searchCenters: SearchCenter[];
  radius: number;
  selectedClientId: string | null;
  onClientSelect: (client: Client) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCircles(centers: SearchCenter[], radiusKm: number) {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = centers.map((sc) => {
    const pts = 64;
    const coords: [number, number][] = [];
    for (let i = 0; i < pts; i++) {
      const angle = (i * 2 * Math.PI) / pts;
      const lat = sc.coordinates[1] + (radiusKm / 111) * Math.cos(angle);
      const lng =
        sc.coordinates[0] +
        (radiusKm / (111 * Math.cos((sc.coordinates[1] * Math.PI) / 180))) * Math.sin(angle);
      coords.push([lng, lat]);
    }
    coords.push(coords[0]);
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
  });
  return { type: 'FeatureCollection' as const, features };
}

function buildGeoJSON(clients: Client[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: clients
      .filter((c) => c.coordinates)
      .map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: c.coordinates! },
        properties: {
          id: c.id,
          name: c.name,
          type: c.type,
          priority: c.priority,
          city: c.city,
          country: c.country,
          notes: c.notes,
          coverage: c.coverage,
          lastMet: c.lastMet,
          distance: c.distance ?? null,
        },
      })),
  };
}

const PRIORITY_STROKE: Record<Priority, string> = {
  High: '#ef4444',
  Medium: '#f97316',
  Low: '#94a3b8',
};

function buildPopupHTML(props: Record<string, unknown>): string {
  const isFund = props.type === 'Fund';
  const priority = String(props.priority ?? 'Low') as Priority;
  const typeBadge = isFund ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700';
  const priorityBadge: Record<Priority, string> = {
    High: 'bg-red-50 text-red-700',
    Medium: 'bg-orange-50 text-orange-700',
    Low: 'bg-slate-50 text-slate-500',
  };
  const lastMetStr = formatLastMet(props.lastMet ? String(props.lastMet) : null);
  const dist = props.distance != null ? `${Number(props.distance).toFixed(0)} km away` : '';

  return `
    <div class="p-3 min-w-[200px] max-w-[260px]">
      <p class="font-semibold text-slate-800 text-sm leading-snug">${props.name}</p>
      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge}">${props.type}</span>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[priority]}">${priority}</span>
      </div>
      <p class="text-xs text-slate-500 mt-1.5">${props.city}, ${props.country}</p>
      ${props.coverage ? `<p class="text-xs text-slate-400 mt-0.5">Coverage: ${props.coverage}</p>` : ''}
      <div class="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100">
        <span class="text-xs text-slate-400">Last met: ${lastMetStr}</span>
        ${dist ? `<span class="text-xs text-slate-400">${dist}</span>` : ''}
      </div>
      ${props.notes ? `<p class="text-xs text-slate-400 mt-1 italic">${props.notes}</p>` : ''}
    </div>
  `;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Map({
  clients,
  searchCenters,
  radius,
  selectedClientId,
  onClientSelect,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const styleLoadedRef = useRef(false);
  const pendingClientsRef = useRef<Client[]>([]);
  const pendingCentersRef = useRef<{ centers: SearchCenter[]; radius: number } | null>(null);
  const clientsRef = useRef<Client[]>(clients);

  // Always keep clientsRef current so click handlers see latest data
  useEffect(() => { clientsRef.current = clients; }, [clients]);

  // ── Initialize map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not set'); return; }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [20, 25],
      zoom: 2,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // ── Radius circles ──────────────────────────────────────────────
      map.addSource('radius-circles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius-circles',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.07 } });
      map.addLayer({ id: 'radius-border', type: 'line', source: 'radius-circles',
        paint: { 'line-color': '#3b82f6', 'line-width': 1.5, 'line-dasharray': [4, 2] } });

      // ── Clustered clients ───────────────────────────────────────────
      map.addSource('clients', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48,
      });

      // Cluster bubble
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'clients',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#64748b', 10, '#3b82f6', 30, '#7c3aed'],
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 26, 30, 34],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      });

      // Cluster count label
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'clients',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      });

      // Individual point — colored by type, stroke by priority
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'clients',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'type'], 'Fund', '#10b981', '#0ea5e9'],
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': [
            'match', ['get', 'priority'],
            'High', PRIORITY_STROKE.High,
            'Medium', PRIORITY_STROKE.Medium,
            PRIORITY_STROKE.Low,
          ],
          'circle-opacity': 0.95,
        },
      });

      // F / C label on individual points
      map.addLayer({
        id: 'unclustered-label',
        type: 'symbol',
        source: 'clients',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['case', ['==', ['get', 'type'], 'Fund'], 'F', 'C'],
          'text-size': 10,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // Selection ring — filtered dynamically when selectedClientId changes
      map.addLayer({
        id: 'selected-ring',
        type: 'circle',
        source: 'clients',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': 14,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#3b82f6',
          'circle-opacity': 0,
          'circle-stroke-opacity': 0.9,
        },
      });

      // ── Cluster click → zoom in ─────────────────────────────────────
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const feat = features[0];
        if (!feat) return;
        const clusterId = feat.properties?.cluster_id as number;
        const src = map.getSource('clients') as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const geo = feat.geometry as GeoJSON.Point;
          map.easeTo({ center: geo.coordinates as [number, number], zoom: zoom + 0.5 });
        });
      });

      // ── Individual point click → popup ──────────────────────────────
      map.on('click', 'unclustered-point', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties as Record<string, unknown>;
        const client = clientsRef.current.find((c) => c.id === props.id);
        if (!client) return;
        const geo = feat.geometry as GeoJSON.Point;
        const lngLat = geo.coordinates as [number, number];

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset: 22, closeButton: true, maxWidth: '280px' })
          .setLngLat(lngLat)
          .setHTML(buildPopupHTML(props))
          .addTo(map);

        onClientSelect(client);
      });

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

      styleLoadedRef.current = true;

      // Apply any data that arrived before the style finished loading
      if (pendingClientsRef.current.length > 0) {
        (map.getSource('clients') as mapboxgl.GeoJSONSource).setData(
          buildGeoJSON(pendingClientsRef.current),
        );
      }
      if (pendingCentersRef.current) {
        applyCircles(map, pendingCentersRef.current.centers, pendingCentersRef.current.radius);
        pendingCentersRef.current = null;
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync client GeoJSON when clients change ───────────────────────────────
  useEffect(() => {
    pendingClientsRef.current = clients;
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    (map.getSource('clients') as mapboxgl.GeoJSONSource | undefined)?.setData(
      buildGeoJSON(clients),
    );
  }, [clients]);

  // ── Update selected-ring filter when selection changes ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    map.setFilter('selected-ring', ['==', ['get', 'id'], selectedClientId ?? '']);
  }, [selectedClientId]);

  // ── Draw radius circles + fit bounds when search centers change ──────────
  function applyCircles(map: mapboxgl.Map, centers: SearchCenter[], radiusKm: number) {
    const src = map.getSource('radius-circles') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    if (centers.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    if (radiusKm === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      if (centers.length === 1) {
        map.flyTo({ center: centers[0].coordinates, zoom: 11, duration: 1200 });
      } else {
        fitToCenters(map, centers);
      }
      return;
    }

    src.setData(buildCircles(centers, radiusKm));
    const bounds = new mapboxgl.LngLatBounds();
    buildCircles(centers, radiusKm).features.forEach((f) =>
      f.geometry.coordinates[0].forEach(([lng, lat]) => bounds.extend([lng, lat])),
    );
    map.fitBounds(bounds, { padding: 60, duration: 1200, maxZoom: 12 });
  }

  function fitToCenters(map: mapboxgl.Map, centers: SearchCenter[]) {
    const bounds = new mapboxgl.LngLatBounds();
    centers.forEach((c) => bounds.extend(c.coordinates));
    map.fitBounds(bounds, { padding: 100, duration: 1200, maxZoom: 11 });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (styleLoadedRef.current) {
      applyCircles(map, searchCenters, radius);
    } else {
      pendingCentersRef.current = { centers: searchCenters, radius };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCenters, radius]);

  // Close popup callback (exposed via ref if needed later)
  const closePopup = useCallback(() => { popupRef.current?.remove(); }, []);
  void closePopup; // suppress unused warning

  return <div ref={containerRef} className="w-full h-full" />;
}
