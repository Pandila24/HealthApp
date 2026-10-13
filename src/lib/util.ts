import type { Units } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Local-time YYYY-MM-DD (not UTC, so late-evening meals land on the right day). */
export function dayKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export const KG_PER_LB = 0.45359237;
export const M_PER_MI = 1609.344;

export const toDisplayWeight = (kg: number, u: Units) => (u === 'imperial' ? kg / KG_PER_LB : kg);
export const fromDisplayWeight = (v: number, u: Units) => (u === 'imperial' ? v * KG_PER_LB : v);
export const weightUnit = (u: Units) => (u === 'imperial' ? 'lb' : 'kg');

export const toDisplayDistance = (m: number, u: Units) => (u === 'imperial' ? m / M_PER_MI : m / 1000);
export const distanceUnit = (u: Units) => (u === 'imperial' ? 'mi' : 'km');

export const round = (n: number, p = 0) => {
  const f = 10 ** p;
  return Math.round(n * f) / f;
};

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Pace as mm:ss per mile/km, or "--" when distance is too small to be meaningful. */
export function formatPace(sec: number, meters: number, u: Units): string {
  const d = toDisplayDistance(meters, u);
  if (d < 0.01) return '--';
  return formatDuration(sec / d);
}

/** Epley estimated one-rep max. */
export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));
