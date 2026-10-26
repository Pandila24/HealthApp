import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTargets, scale, totals } from '../nutrition';
import { acceptPoint, haversine, splits } from '../geo';
import { buildSuggestions } from '../suggestions';
import { addDays, dayKey, formatPace, M_PER_MI } from '../util';
import { initialState } from '../../store';
import {
  DAY_TEMPLATES,
  DEFAULT_PLAN,
  PLAN_FOODS,
  SESSIONS,
  buildWorkout,
  conditioningFor,
  dayItems,
  groceryList,
  paceAdvice,
  planTargets,
  scaleDay,
  sessionToRoutine,
  setsFor,
  sumNutrients,
  templateFor,
  weekInfo,
  weekNumber,
  weightPace,
} from '../plan';
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


describe('plan targets', () => {
  // 6'0", 290 lb, 31 y/o male, 39.3% body fat — the plan's reference starting point.
  const me = { sex: 'male', age: 31, heightCm: 182.88, weightKg: 290 * 0.45359237, activity: 1.45, goal: 'lose' } as const;
  const plan = { ...DEFAULT_PLAN, active: true, startDate: '2026-10-26', bodyFatPct: 39.3 };

  it('counts plan weeks and phases', () => {
    expect(weekNumber(plan, '2026-10-26')).toBe(1);
    expect(weekNumber(plan, '2026-11-01')).toBe(1);
    expect(weekNumber(plan, '2026-11-02')).toBe(2);
    expect(weekInfo(plan, '2026-10-26').phase).toBe('ramp');
    expect(weekInfo(plan, '2026-11-09').phase).toBe('cut');
    expect(weekInfo(plan, '2026-11-09').type).toBe('load');
    // every 6th week deloads; the 12th also has a diet break
    expect(weekInfo(plan, '2026-11-30').type).toBe('deload');
    expect(weekInfo(plan, '2026-11-30').dietBreak).toBe(false);
    expect(weekInfo(plan, '2027-01-11').week).toBe(12);
    expect(weekInfo(plan, '2027-01-11').dietBreak).toBe(true);
  });

  it('sizes calories and macros for the re-entry and lean-out phases', () => {
    const ramp = planTargets(me, plan, '2026-10-26');
    expect(ramp.calories).toBe(2850);
    const cut = planTargets(me, plan, '2026-11-09');
    expect(cut.calories).toBe(2610);
    expect(cut.protein).toBe(176); // 1 g per lb of lean mass
    expect(cut.fat).toBe(73);
    expect(cut.carbs).toBe(312);
    expect(Math.abs(cut.protein * 4 + cut.carbs * 4 + cut.fat * 9 - cut.calories)).toBeLessThan(15);
  });

  it('eats at maintenance during a diet break and in a surplus when building', () => {
    const maintenance = planTargets(me, { ...plan, phaseOverride: 'build' }, '2026-11-09').calories;
    expect(maintenance).toBe(3580);
    const dietBreak = planTargets(me, plan, '2027-01-11').calories;
    expect(dietBreak).toBe(3350);
  });

  it('applies the manual calorie nudge and enforces a floor', () => {
    expect(planTargets(me, { ...plan, calAdjust: -150 }, '2026-11-09').calories).toBe(2460);
    expect(planTargets({ ...me, weightKg: 50 }, plan, '2026-11-09').calories).toBe(2000);
  });

  it('falls back to a BMI-25 reference weight when body fat is unknown', () => {
    const t = planTargets(me, { ...plan, bodyFatPct: null }, '2026-11-09');
    expect(t.protein).toBe(Math.round(25 * 1.8288 ** 2 * 2.20462));
  });

  it('flags a stalled or too-fast trend', () => {
    const w = (n: number) => Array.from({ length: 15 }, (_, i) => ({ date: addDays('2026-11-23', -14 + i), kg: 130 - (n * i) / 14 }));
    expect(weightPace(w(0.3), '2026-11-23')!.pctPerWeek).toBeGreaterThan(-0.2);
    expect(paceAdvice({ plan, weights: w(0.3) }, '2026-11-23').delta).toBe(-150); // ~0.1%/wk
    expect(paceAdvice({ plan, weights: w(1.5) }, '2026-11-23').status).toBe('ok'); // ~0.6%/wk
    expect(paceAdvice({ plan, weights: w(4) }, '2026-11-23').delta).toBe(150); // ~1.6%/wk
    expect(paceAdvice({ plan, weights: [] }, '2026-11-23').status).toBe('none');
  });
});

describe('meal plan', () => {
  const banned = /peanut|almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil nut|pine nut|nut butter|fish|salmon|tuna|tilapia|cod\b|anchov|sardine|trout|halibut|mahi/i;

  it('contains no nuts or fish', () => {
    for (const [key, f] of Object.entries(PLAN_FOODS)) expect(`${key} ${f.name}`).not.toMatch(banned);
    for (const d of DAY_TEMPLATES) for (const m of Object.values(d.meals)) expect(`${m.title} ${m.how}`).not.toMatch(banned);
  });

  it('each rotating day hits the lean-out macros when scaled to 2,610 kcal', () => {
    for (const d of DAY_TEMPLATES) {
      const x = sumNutrients(dayItems(scaleDay(d, 2610)));
      expect(x.calories).toBeGreaterThan(2610 * 0.97);
      expect(x.calories).toBeLessThan(2610 * 1.03);
      expect(x.protein).toBeGreaterThan(160);
      expect(x.protein).toBeLessThan(200);
      expect(x.fat).toBeGreaterThan(60);
      expect(x.fat).toBeLessThan(85);
      expect(x.fiber).toBeGreaterThan(30);
    }
  });

  it('scales portions with calories and keeps whole eggs', () => {
    const a = DAY_TEMPLATES[0];
    const big = sumNutrients(dayItems(scaleDay(a, 3200))).calories;
    expect(big).toBeGreaterThan(3200 * 0.96);
    expect(big).toBeLessThan(3200 * 1.04);
    for (const i of dayItems(scaleDay(a, 2850))) if (i.food === 'egg') expect(i.grams % 50).toBe(0);
  });

  it('rotates A/B/C through the week', () => {
    expect([1, 2, 3, 4, 5, 6, 0].map((wd) => templateFor(wd).id).join('')).toBe('ABCABCA');
  });

  it('builds a weekly grocery list with raw weights for meat and grains', () => {
    const list = groceryList(2610);
    const chicken = list.find((g) => g.key === 'chicken')!;
    expect(chicken.grams).toBeGreaterThan(500);
    expect(chicken.raw!.grams).toBeGreaterThan(chicken.grams);
    const rice = list.find((g) => g.key === 'rice')!;
    expect(rice.raw!.grams).toBeLessThan(rice.grams);
  });
});

describe('training program', () => {
  const lib = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')) as { id: string; name: string; primaryMuscles: string[] }[];
  const byId = new Map(lib.map((e) => [e.id, e]));

  it('only uses exercises that exist in the library, with matching names', () => {
    for (const s of SESSIONS) for (const e of s.exercises) {
      expect(byId.has(e.id), e.id).toBe(true);
      expect(byId.get(e.id)!.name).toBe(e.name);
    }
  });

  it('is five lifting days with unique weekdays, and Wednesday is conditioning', () => {
    expect(SESSIONS).toHaveLength(5);
    expect(new Set(SESSIONS.map((s) => s.weekday)).size).toBe(5);
    expect(SESSIONS.some((s) => s.weekday === 3)).toBe(false);
    expect(SESSIONS.some((s) => s.weekday === 0)).toBe(false);
  });

  it('emphasises upper body, arms and delts every week', () => {
    const sets = new Map<string, number>();
    for (const s of SESSIONS) for (const e of s.exercises) for (const m of byId.get(e.id)!.primaryMuscles) sets.set(m, (sets.get(m) ?? 0) + e.sets);
    expect(sets.get('biceps')!).toBeGreaterThanOrEqual(12);
    expect(sets.get('triceps')!).toBeGreaterThanOrEqual(9);
    expect(sets.get('shoulders')!).toBeGreaterThanOrEqual(14);
    expect(sets.get('lats')! + sets.get('middle back')!).toBeGreaterThanOrEqual(14);
    expect(sets.get('chest')!).toBeGreaterThanOrEqual(10);
  });

  it('trims volume on ramp/deload weeks and adds arm/delt volume when building', () => {
    const ex = { sets: 4, focus: true };
    expect(setsFor(ex, 'load', 'cut')).toBe(4);
    expect(setsFor(ex, 'ramp', 'ramp')).toBe(3);
    expect(setsFor(ex, 'deload', 'cut')).toBe(2);
    expect(setsFor(ex, 'load', 'build')).toBe(5);
    expect(setsFor({ sets: 4 }, 'load', 'build')).toBe(4);
    expect(setsFor({ sets: 2 }, 'ramp', 'ramp')).toBe(2);
  });

  it('converts a session to a routine and pre-fills weights from history', () => {
    const r = sessionToRoutine(SESSIONS[0]);
    expect(r.id).toBe('plan-upper-a');
    expect(r.exercises[0]).toMatchObject({ exerciseId: 'Smith_Machine_Bench_Press', sets: 4, reps: 6 });
    const hist = [{ id: 'w', name: 'x', startedAt: 1, finishedAt: 2, exercises: [{ exerciseId: 'Smith_Machine_Bench_Press', name: 'Smith Machine Bench Press', sets: [{ weight: 60, reps: 8, done: true }] }] }];
    const w = buildWorkout(hist, r);
    expect(w.exercises[0].sets).toHaveLength(4);
    expect(w.exercises[0].sets.every((x) => x.weight === 60 && !x.done)).toBe(true);
    expect(w.exercises[1].sets[0].weight).toBe(0);
  });

  it('alternates zone-2 and shift intervals, and eases off on ramp/deload weeks', () => {
    const base = { phase: 'cut', dietBreak: false, effort: '' } as const;
    expect(conditioningFor({ ...base, week: 3, type: 'load' }).title).toMatch(/Zone 2/);
    expect(conditioningFor({ ...base, week: 4, type: 'load' }).title).toMatch(/interval/i);
    expect(conditioningFor({ ...base, week: 6, type: 'deload' }).title).toMatch(/Easy/);
  });
});
