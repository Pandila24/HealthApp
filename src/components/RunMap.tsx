import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { RunPoint } from '../types';

/** OpenStreetMap tiles: free, no API key (attribution required). */
export default function RunMap({ points, follow = false, height = 260 }: { points: RunPoint[]; follow?: boolean; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    line.current = L.polyline([], { color: '#22c55e', weight: 5 }).addTo(m);
    dot.current = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 });
    m.setView([39.5, -98.35], 3);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !line.current || !dot.current) return;
    const ll = points.map((p) => [p.lat, p.lng] as L.LatLngTuple);
    line.current.setLatLngs(ll);
    if (!ll.length) return;
    const last = ll[ll.length - 1];
    dot.current.setLatLng(last);
    if (!m.hasLayer(dot.current)) dot.current.addTo(m);
    if (follow) m.setView(last, Math.max(m.getZoom(), 16));
    else if (ll.length > 1) m.fitBounds(L.latLngBounds(ll), { padding: [20, 20] });
    else m.setView(last, 16);
  }, [points, follow]);

  return <div ref={el} className="run-map" style={{ height }} />;
}
