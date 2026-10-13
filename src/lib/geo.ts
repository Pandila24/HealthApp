import type { RunPoint } from '../types';

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Max accepted GPS error radius, in meters. Phones report worse than this indoors. */
export const MAX_ACCURACY_M = 35;
/** Faster than ~43 km/h on foot is a GPS jump, not running. */
const MAX_SPEED_MS = 12;

/**
 * Decide whether a new fix should be appended, and how far it moved us.
 * Filters inaccurate fixes and teleports so standing still doesn't add distance.
 */
export function acceptPoint(prev: RunPoint | undefined, next: RunPoint): { accept: boolean; meters: number } {
  if (next.acc > MAX_ACCURACY_M) return { accept: false, meters: 0 };
  if (!prev) return { accept: true, meters: 0 };
  const d = haversine(prev, next);
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return { accept: false, meters: 0 };
  if (d / dt > MAX_SPEED_MS) return { accept: false, meters: 0 };
  // Jitter: movement smaller than the combined error isn't real movement.
  if (d < Math.max(3, (prev.acc + next.acc) / 4)) return { accept: false, meters: 0 };
  return { accept: true, meters: d };
}

/** Per-unit splits (seconds for each full mile/km), estimated from point timestamps. */
export function splits(points: RunPoint[], unitMeters: number): number[] {
  const out: number[] = [];
  let acc = 0;
  let splitStart = points[0]?.t ?? 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    if (acc + d >= unitMeters) {
      const frac = (unitMeters - acc) / d;
      const tCross = points[i - 1].t + frac * (points[i].t - points[i - 1].t);
      out.push((tCross - splitStart) / 1000);
      splitStart = tCross;
      acc = acc + d - unitMeters;
    } else acc += d;
  }
  return out;
}
