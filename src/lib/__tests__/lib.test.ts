import { describe, expect, it } from 'vitest';
import { computeTargets, scale, totals } from '../nutrition';
import { acceptPoint, haversine, splits } from '../geo';
import { buildSuggestions } from '../suggestions';
import { addDays, dayKey, formatPace, M_PER_MI } from '../util';
import { initialState } from '../../store';
import type { AppState, FoodEntry, RunPoint } from '../../types';

describe('nutrition', () => {
  it('computes sensible targets for a cut', () => {
    const t = computeTargets({ sex: 'male', age: 30, heightCm: 180, weightKg: 90, activity: 1.55, goal: 'lose' });
    expect(t.protein).toBe(162); // BMI-25 reference weight for 180 cm = 81 kg × 2.0
    expect(t.calories).toBeGreaterThan(2000);
    expect(t.calories).toBeLessThan(2600);
    // macros add back up to calories (within rounding)
    expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.calories)).toBeLessThan(15);
  });

  it('bases protein on a BMI-25 reference weight at high body weight', () => {
    // 6'0", 290 lb, 31 y/o male, moderate activity, cutting
    const t = computeTargets({ sex: 'male', age: 31, heightCm: 182.88, weightKg: 290 * 0.45359237, activity: 1.55, goal: 'lose' });
    expect(t.calories).toBe(2860);
    expect(t.protein).toBe(167);
  });

  it('scales per-100g values and totals entries', () => {
    const per100g = { calories: 165, protein: 31, carbs: 0, fat: 3.6, sugar: 0, fiber: 0 };
    expect(scale(per100g, 200).protein).toBeCloseTo(62);
    const e = (grams: number): FoodEntry => ({ id: 'x', date: '2026-01-01', meal: 'lunch', grams, createdAt: 0, food: { id: 'f', name: 'Chicken', source: 'custom', per100g } });
    expect(totals([e(100), e(50)]).calories).toBeCloseTo(247.5);
  });
});

describe('geo', () => {
  it('measures ~111 km per degree latitude', () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });

  it('rejects inaccurate fixes, jitter and teleports', () => {
    const a: RunPoint = { lat: 40, lng: -74, t: 0, acc: 5 };
    expect(acceptPoint(a, { ...a, t: 1000, acc: 80 }).accept).toBe(false);
    expect(acceptPoint(a, { ...a, lat: 40.00001, t: 1000 }).accept).toBe(false); // ~1 m
    expect(acceptPoint(a, { ...a, lat: 40.01, t: 1000 }).accept).toBe(false); // 1.1 km in 1 s
    const ok = acceptPoint(a, { ...a, lat: 40.0001, t: 5000 }); // ~11 m in 5 s
    expect(ok.accept).toBe(true);
    expect(ok.meters).toBeCloseTo(11.1, 0);
  });

  it('computes mile splits', () => {
    // straight line north, 10 m every 4 s → 1 mile ≈ 643.7 s
    const pts: RunPoint[] = Array.from({ length: 400 }, (_, i) => ({ lat: 40 + (i * 10) / 111_195, lng: -74, t: i * 4000, acc: 5 }));
    const s = splits(pts, M_PER_MI);
    expect(s).toHaveLength(2);
    expect(s[0]).toBeCloseTo(643.7, 0);
    expect(formatPace(643.7, M_PER_MI, 'imperial')).toBe('10:44');
  });
});

describe('suggestions', () => {
  const base = (patch: Partial<AppState> = {}): AppState => ({ ...initialState, ...patch });

  it('nudges protein in the afternoon', () => {
    const now = new Date(2026, 9, 13, 15);
    const food = { id: 'f', name: 'Bread', source: 'custom' as const, per100g: { calories: 250, protein: 8, carbs: 50, fat: 3, sugar: 5, fiber: 3 } };
    const s = buildSuggestions(base({ foodLog: [{ id: '1', date: dayKey(now), meal: 'lunch', grams: 100, createdAt: 0, food }] }), null, now);
    expect(s.find((x) => x.id === 'protein')).toBeTruthy();
  });

  it('suggests adding weight after hitting 12 reps on all sets', () => {
    const now = new Date(2026, 9, 13, 9);
    const w = { id: 'w', name: 'A', startedAt: now.getTime() - 86_400_000, exercises: [{ exerciseId: 'Barbell_Squat', name: 'Squat', sets: [1, 2, 3].map(() => ({ weight: 100 * 0.45359237, reps: 12, done: true })) }] };
    const ex = new Map([['Barbell_Squat', { id: 'Barbell_Squat', primaryMuscles: ['quadriceps'] } as any]]);
    const s = buildSuggestions(base({ workouts: [w] }), ex, now);
    const po = s.find((x) => x.id === 'po-Barbell_Squat')!;
    expect(po.title).toMatch(/heavier/);
    expect(po.body).toContain('110 lb');
  });

  it('warns on >10% weekly mileage jumps', () => {
    const now = new Date(2026, 9, 13, 9).getTime();
    const run = (daysAgo: number, m: number) => ({ id: String(daysAgo), startedAt: now - daysAgo * 86_400_000, durationSec: 1800, distanceM: m, points: [] });
    const s = buildSuggestions(base({ runs: [run(2, 8000), run(9, 5000)] }), null, new Date(now));
    expect(s.find((x) => x.id === '10pct')).toBeTruthy();
  });
});

describe('dates', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
