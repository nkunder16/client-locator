'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export interface PlottedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  locations: PlottedLocation[];
  onDelete: (id: string) => void;
}

function buildGeoJSON(locations: PlottedLocation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((l) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [l.longitude, l.latitude] },
      properties: { id: l.id, name: l.name, lat: l.latitude, lng: l.longitude },
    })),
  };
}

function buildPopupHTML(id: string, name: string, lat: number, lng: number): string {
  return `
    <div style="padding:12px 14px;min-width:200px;font-family:Inter,ui-sans-serif,system-ui,sans-serif">
      <p style="font-weight:600;font-size:13px;color:#0f172a;margin:0 0 4px;line-height:1.3">${name}</p>
      <p style="font-size:11px;color:#64748b;margin:0;font-variant-numeric:tabular-nums">
        ${lat.toFixed(6)}, ${lng.toFixed(6)}
      </p>
      <button
        onclick="window.__locatorDelete('${id}')"
        style="margin-top:10px;font-size:11px;color:#ef4444;border:1px solid #fecaca;
               background:#fff5f5;border-radius:4px;cursor:pointer;padding:3px 8px;font-weight:500"
      >Delete marker</button>
    </div>
  `;
}

function fitToLocations(map: mapboxgl.Map, locations: PlottedLocation[]) {
  if (locations.length === 1) {
    map.flyTo({ center: [locations[0].longitude, locations[0].latitude], zoom: 12, duration: 900 });
    return;
  }
  const bounds = new mapboxgl.LngLatBounds();
  locations.forEach((l) => bounds.extend([l.longitude, l.latitude]));
  map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 900 });
}

export default function LocationMap({ locations, onDelete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const styleLoadedRef = useRef(false);
  const pendingRef = useRef<PlottedLocation[]>([]);
  const onDeleteRef = useRef(onDelete);

  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);

  // Register global delete handler for popup buttons
  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__locatorDelete'] = (id: string) => {
      onDeleteRef.current(id);
      popupRef.current?.remove();
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)['__locatorDelete'];
    };
  }, []);

  // Init map once
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
      map.addSource('locations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'location-points',
        type: 'circle',
        source: 'locations',
        paint: {
          'circle-color': '#3b82f6',
          'circle-radius': 9,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      });

      map.addLayer({
        id: 'location-labels',
        type: 'symbol',
        source: 'locations',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      map.on('click', 'location-points', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties as { id: string; name: string; lat: number; lng: number };
        const geo = feat.geometry as GeoJSON.Point;
        const [pLng, pLat] = geo.coordinates;

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset: 16, closeButton: true, maxWidth: '260px' })
          .setLngLat([pLng, pLat])
          .setHTML(buildPopupHTML(props.id, props.name, props.lat, props.lng))
          .addTo(map);
      });

      map.on('mouseenter', 'location-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'location-points', () => { map.getCanvas().style.cursor = ''; });

      styleLoadedRef.current = true;

      // Apply any locations that arrived before style loaded
      if (pendingRef.current.length > 0) {
        (map.getSource('locations') as mapboxgl.GeoJSONSource).setData(
          buildGeoJSON(pendingRef.current),
        );
        fitToLocations(map, pendingRef.current);
        pendingRef.current = [];
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
  }, []);

  // Sync GeoJSON when locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) {
      pendingRef.current = locations;
      return;
    }
    (map.getSource('locations') as mapboxgl.GeoJSONSource | undefined)?.setData(
      buildGeoJSON(locations),
    );
    if (locations.length > 0) fitToLocations(map, locations);
  }, [locations]);

  return <div ref={containerRef} className="w-full h-full" />;
}
