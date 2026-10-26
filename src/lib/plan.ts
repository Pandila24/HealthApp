import type { AppState, Food, FoodEntry, Meal, Nutrients, PlanPhaseId, PlanState, Profile, Routine, Targets, Workout } from '../types';
import { bmr } from './nutrition';
import { addDays, dayKey, uid } from './util';

/**
 * "Train like a pro hockey player" program: a lean, athletic, broad-shouldered,
 * big-armed build — no ice required. Everything here runs on-device.
 *
 *  Phase 0  Re-entry   (weeks 1–2)   mild deficit, light volume, relearn the lifts
 *  Phase 1  Lean-out   (until ~20–25% body fat)   ~22% deficit, high protein
 *  Phase 2  Build      upper-body + arm emphasis, small surplus
 */

export const KG_TO_LB = 2.20462;

export const DEFAULT_PLAN: PlanState = {
  active: false,
  startDate: '',
  phaseOverride: null,
  bodyFatPct: null,
  activity: 1.45,
  calAdjust: 0,
  checkins: [],
  conditioning: [],
};

// ---------------------------------------------------------------------------
// Phases, weeks and targets
// ---------------------------------------------------------------------------

export interface PhaseInfo {
  label: string;
  /** Calories as a fraction of maintenance. */
  mult: number;
  steps: string;
  blurb: string;
}

export const PHASES: Record<PlanPhaseId, PhaseInfo> = {
  ramp: {
    label: 'Re-entry',
    mult: 0.85,
    steps: '7,000',
    blurb: 'Two easy weeks to get back into lifting after the layoff. Mild deficit, fewer sets, stop ~4 reps short of failure.',
  },
  cut: {
    label: 'Lean-out',
    mult: 0.78,
    steps: '9,000',
    blurb: 'Main fat-loss phase: ~22% below maintenance, protein sized to lean mass, heavy lifting to hold on to muscle. Aim to lose roughly 0.5–1% of body weight per week.',
  },
  build: {
    label: 'Upper-body build',
    mult: 1.07,
    steps: '8,000',
    blurb: 'Small surplus with extra sets on delts, arms and upper back. Switch to this when you reach roughly 20–25% body fat.',
  },
};

const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
};

/** 1-based plan week (0 or negative = hasn't started yet). */
export function weekNumber(plan: Pick<PlanState, 'startDate'>, today = dayKey()): number {
  if (!plan.startDate) return 0;
  return Math.floor(daysBetween(plan.startDate, today) / 7) + 1;
}

export function phaseFor(plan: PlanState, today = dayKey()): PlanPhaseId {
  if (plan.phaseOverride) return plan.phaseOverride;
  return weekNumber(plan, today) <= 2 ? 'ramp' : 'cut';
}

export type WeekType = 'ramp' | 'load' | 'deload';

/** Weeks 1–2 are the ramp; every 6th week is a deload. */
export function weekType(n: number, phase: PlanPhaseId = 'cut'): WeekType {
  if (n > 0 && n % 6 === 0) return 'deload';
  if (n <= 2 && phase === 'ramp') return 'ramp';
  return 'load';
}

const RIR_BY_POSITION: Record<number, string> = { 1: '3', 2: '2–3', 3: '2', 4: '1–2', 5: '1', 6: 'deload' };

export interface WeekInfo {
  week: number;
  phase: PlanPhaseId;
  type: WeekType;
  dietBreak: boolean;
  /** Reps-in-reserve guidance for the week. */
  effort: string;
}

export function weekInfo(plan: PlanState, today = dayKey()): WeekInfo {
  const week = weekNumber(plan, today);
  const phase = phaseFor(plan, today);
  const type = weekType(week, phase);
  // A planned week at maintenance every 12 weeks during the cut (coincides with a deload).
  const dietBreak = phase === 'cut' && week > 0 && week % 12 === 0;
  const effort = type === 'ramp' ? 'Stop ~4 reps short of failure' : type === 'deload' ? 'Half the sets, easy effort' : `Leave ${RIR_BY_POSITION[((week - 1) % 6) + 1] ?? '2'} reps in the tank on the last set`;
  return { week, phase, type, dietBreak, effort };
}

/** Calorie and macro targets for the current phase, sized from lean mass. */
export function planTargets(profile: Profile, plan: PlanState, today = dayKey()): Targets {
  const info = weekInfo(plan, today);
  const maintenance = bmr(profile) * plan.activity;
  const mult = info.dietBreak ? 1 : PHASES[info.phase].mult;
  const calories = Math.max(2000, Math.round((maintenance * mult + plan.calAdjust) / 10) * 10);
  // Protein follows lean mass (1 g per lb), not total weight; falls back to a BMI-25 weight.
  const leanKg = plan.bodyFatPct ? profile.weightKg * (1 - plan.bodyFatPct / 100) : Math.min(profile.weightKg, 25 * (profile.heightCm / 100) ** 2);
  const protein = Math.round(leanKg * KG_TO_LB);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return {
    calories,
    protein,
    carbs,
    fat,
    // Total sugars (incl. fruit and dairy) — 12% of calories keeps whole foods in play.
    sugar: Math.round((calories * 0.12) / 4),
    fiber: Math.round((calories / 1000) * 14),
  };
}

/** Targets for the whole app: plan-driven when a plan is active, otherwise the generic formula. */
export function targetsFor(s: Pick<AppState, 'profile' | 'plan'>, fallback: (p: Profile) => Targets): Targets {
  return s.plan.active ? planTargets(s.profile, s.plan) : fallback(s.profile);
}

// ---------------------------------------------------------------------------
// Progress / pacing advice
// ---------------------------------------------------------------------------

export interface Pace {
  kgPerWeek: number;
  pctPerWeek: number;
  days: number;
}

/** Least-squares weight trend over the last 3 weeks (needs ≥3 weigh-ins spanning ≥7 days). */
export function weightPace(weights: { date: string; kg: number }[], today = dayKey()): Pace | null {
  const pts = weights.filter((w) => w.date >= addDays(today, -21) && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 3) return null;
  const t0 = pts[0].date;
  const xs = pts.map((p) => daysBetween(t0, p.date));
  const span = xs[xs.length - 1];
  if (span < 7) return null;
  const ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const kgPerWeek = slope * 7;
  return { kgPerWeek, pctPerWeek: (kgPerWeek / my) * 100, days: span };
}

export interface Advice {
  status: 'ok' | 'slow' | 'fast' | 'none';
  message: string;
  /** Suggested calorie change (kcal/day), 0 if none. */
  delta: number;
}

export function paceAdvice(s: Pick<AppState, 'plan' | 'weights'>, today = dayKey()): Advice {
  const info = weekInfo(s.plan, today);
  const pace = weightPace(s.weights, today);
  if (!pace) return { status: 'none', message: 'Log your weight 3+ times a week for two weeks and I will tell you whether to adjust calories.', delta: 0 };
  const pct = pace.pctPerWeek;
  const fmt = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}% of body weight per week`;
  if (info.dietBreak) return { status: 'none', message: `Diet-break week: eat at maintenance and ignore the scale (${fmt}).`, delta: 0 };
  if (info.phase === 'build') {
    if (pct < 0.15) return { status: 'slow', message: `Trend is ${fmt}. Add ~150 kcal/day for a steady lean gain (0.25–0.5%/week).`, delta: 150 };
    if (pct > 0.7) return { status: 'fast', message: `Trend is ${fmt}, faster than lean gain needs. Trim ~100 kcal/day to limit fat gain.`, delta: -100 };
    return { status: 'ok', message: `Trend is ${fmt}. Right where it should be.`, delta: 0 };
  }
  if (pct > -0.4) return { status: 'slow', message: `Trend is ${fmt}. Trim ~150 kcal/day (or add 2,000 steps) — target is 0.5–1% loss per week.`, delta: -150 };
  if (pct < -1.2) return { status: 'fast', message: `Trend is ${fmt}. That is fast enough to cost muscle. Add ~150 kcal/day.`, delta: 150 };
  return { status: 'ok', message: `Trend is ${fmt}. On target — change nothing.`, delta: 0 };
}

// ---------------------------------------------------------------------------
// Training program (Planet Fitness / Mountain Side friendly — no ice needed)
// ---------------------------------------------------------------------------

export interface ProgramExercise {
  id: string;
  name: string;
  sets: number;
  reps: [number, number];
  /** Rest between sets, seconds. */
  rest: number;
  /** Arms/delts work that gets +1 set in the build phase. */
  focus?: boolean;
  note?: string;
}

export interface ProgramSession {
  id: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  name: string;
  focus: string;
  exercises: ProgramExercise[];
}

const ex = (id: string, name: string, sets: number, lo: number, hi: number, rest: number, extra: Partial<ProgramExercise> = {}): ProgramExercise => ({ id, name, sets, reps: [lo, hi], rest, ...extra });

export const SESSIONS: ProgramSession[] = [
  {
    id: 'upper-a',
    weekday: 1,
    name: 'Upper A · Push + Back',
    focus: 'Chest, back, delts, arms',
    exercises: [
      ex('Smith_Machine_Bench_Press', 'Smith Machine Bench Press', 4, 6, 10, 150),
      ex('Seated_Cable_Rows', 'Seated Cable Rows', 4, 8, 12, 120),
      ex('Incline_Dumbbell_Press', 'Incline Dumbbell Press', 3, 8, 12, 120),
      ex('Wide-Grip_Lat_Pulldown', 'Wide-Grip Lat Pulldown', 3, 8, 12, 120),
      ex('Side_Lateral_Raise', 'Side Lateral Raise', 3, 12, 15, 60, { focus: true, note: 'Light and strict — no swinging.' }),
      ex('Triceps_Pushdown_-_Rope_Attachment', 'Triceps Pushdown - Rope Attachment', 3, 10, 12, 75, { focus: true }),
      ex('Dumbbell_Bicep_Curl', 'Dumbbell Bicep Curl', 3, 10, 12, 75, { focus: true }),
    ],
  },
  {
    id: 'lower-a',
    weekday: 2,
    name: 'Lower A · Quads + Core',
    focus: 'Legs, hips, anti-rotation core',
    exercises: [
      ex('Leg_Press', 'Leg Press', 4, 8, 12, 150),
      ex('Romanian_Deadlift', 'Romanian Deadlift', 3, 8, 10, 150, { note: 'Dumbbells or Smith machine at Planet Fitness; barbell if the gym has racks.' }),
      ex('Dumbbell_Step_Ups', 'Dumbbell Step Ups', 3, 10, 12, 90, { note: 'Reps per leg. Mimics a skating stride.' }),
      ex('Lying_Leg_Curls', 'Lying Leg Curls', 3, 10, 12, 90),
      ex('Standing_Calf_Raises', 'Standing Calf Raises', 4, 12, 15, 60),
      ex('Cable_Crunch', 'Cable Crunch', 3, 10, 12, 60),
      ex('Pallof_Press', 'Pallof Press', 3, 10, 12, 45, { note: 'Reps per side. Resist the rotation.' }),
    ],
  },
  {
    id: 'upper-b',
    weekday: 4,
    name: 'Upper B · Pull + Shoulders',
    focus: 'Back, delts, arms, upper chest',
    exercises: [
      ex('One-Arm_Dumbbell_Row', 'One-Arm Dumbbell Row', 4, 8, 12, 120, { note: 'Reps per arm.' }),
      ex('Dumbbell_Shoulder_Press', 'Dumbbell Shoulder Press', 4, 8, 12, 120, { focus: true }),
      ex('Close-Grip_Front_Lat_Pulldown', 'Close-Grip Front Lat Pulldown', 3, 10, 12, 90),
      ex('Incline_Cable_Flye', 'Incline Cable Flye', 3, 12, 15, 75),
      ex('Face_Pull', 'Face Pull', 3, 12, 15, 60, { focus: true, note: 'Shoulder health — keep it light.' }),
      ex('Incline_Dumbbell_Curl', 'Incline Dumbbell Curl', 3, 10, 12, 75, { focus: true }),
      ex('Cable_Rope_Overhead_Triceps_Extension', 'Cable Rope Overhead Triceps Extension', 3, 10, 12, 75, { focus: true }),
    ],
  },
  {
    id: 'lower-b',
    weekday: 5,
    name: 'Lower B · Glutes + Hamstrings',
    focus: 'Posterior chain, hips, rotation',
    exercises: [
      ex('Barbell_Hip_Thrust', 'Barbell Hip Thrust', 4, 8, 12, 120, { note: 'Smith machine works fine.' }),
      ex('Goblet_Squat', 'Goblet Squat', 3, 10, 12, 90, { note: 'Hold one dumbbell at your chest.' }),
      ex('Leg_Extensions', 'Leg Extensions', 3, 12, 15, 75),
      ex('Seated_Leg_Curl', 'Seated Leg Curl', 3, 10, 12, 90),
      ex('Thigh_Adductor', 'Thigh Adductor', 3, 12, 15, 60, { note: 'Groin durability — a hockey staple.' }),
      ex('Seated_Calf_Raise', 'Seated Calf Raise', 3, 12, 15, 60),
      ex('Standing_Cable_Wood_Chop', 'Standing Cable Wood Chop', 3, 10, 12, 60, { note: 'Reps per side. Rotational power.' }),
    ],
  },
  {
    id: 'arms-delts',
    weekday: 6,
    name: 'Arms + Delts',
    focus: 'Biceps, triceps, side/rear delts, traps',
    exercises: [
      ex('Smith_Machine_Close-Grip_Bench_Press', 'Smith Machine Close-Grip Bench Press', 3, 8, 10, 120, { focus: true }),
      ex('EZ-Bar_Curl', 'EZ-Bar Curl', 4, 8, 12, 90, { focus: true, note: 'Dumbbells if there is no EZ bar.' }),
      ex('Triceps_Pushdown_-_V-Bar_Attachment', 'Triceps Pushdown - V-Bar Attachment', 3, 10, 12, 75, { focus: true }),
      ex('Hammer_Curls', 'Hammer Curls', 3, 10, 12, 75, { focus: true }),
      ex('Cable_Seated_Lateral_Raise', 'Cable Seated Lateral Raise', 4, 12, 15, 60, { focus: true }),
      ex('Reverse_Machine_Flyes', 'Reverse Machine Flyes', 3, 12, 15, 60, { focus: true }),
      ex('Dumbbell_Shrug', 'Dumbbell Shrug', 3, 12, 12, 60),
    ],
  },
];

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const sessionFor = (weekday: number) => SESSIONS.find((s) => s.weekday === weekday) ?? null;

export interface Conditioning {
  title: string;
  detail: string;
}

/** Wednesday conditioning (and optional Sunday walk). Low-impact, no ice. */
export function conditioningFor(info: WeekInfo): Conditioning {
  if (info.type === 'deload' || info.type === 'ramp') {
    return { title: 'Easy conditioning · 25–30 min', detail: 'Incline walk, bike or elliptical at a pace where you can talk in full sentences.' };
  }
  if (info.week % 2 === 0) {
    return {
      title: 'Shift intervals · ~30 min',
      detail: '5 min easy warm-up, then 8 rounds of 45 s hard / 75 s easy on the bike or elliptical (hard = you could say a few words), 5 min cool-down. Mimics hockey shift length.',
    };
  }
  return { title: 'Zone 2 · 40–45 min', detail: 'Incline treadmill walk, bike or elliptical at a steady, conversational effort (roughly 120–140 bpm).' };
}

export const CONDITIONING_KINDS = ['Incline walk', 'Stationary bike', 'Elliptical', 'Stair climber', 'Rowing', 'Run / walk', 'Other'];

export type DayPlan = { kind: 'lift'; session: ProgramSession } | { kind: 'conditioning' } | { kind: 'rest' };

export function dayPlan(weekday: number): DayPlan {
  const s = sessionFor(weekday);
  if (s) return { kind: 'lift', session: s };
  return weekday === 3 ? { kind: 'conditioning' } : { kind: 'rest' };
}

export const planRoutineId = (session: ProgramSession) => `plan-${session.id}`;

/** Sets for an exercise this week (ramp/deload trim volume, build adds a set to arm/delt work). */
export function setsFor(e: Pick<ProgramExercise, 'sets' | 'focus'>, type: WeekType, phase: PlanPhaseId): number {
  const base = e.sets + (phase === 'build' && e.focus ? 1 : 0);
  if (type === 'ramp') return Math.max(2, Math.round(base * 0.67));
  if (type === 'deload') return Math.max(2, Math.round(base * 0.5));
  return base;
}

export function sessionToRoutine(session: ProgramSession, type: WeekType = 'load', phase: PlanPhaseId = 'cut'): Routine {
  return {
    id: planRoutineId(session),
    name: session.name,
    exercises: session.exercises.map((e) => ({ exerciseId: e.id, name: e.name, sets: setsFor(e, type, phase), reps: e.reps[0] })),
  };
}

/** The user's own (possibly edited) copy of a program routine, with this week's volume applied. */
export function routineForToday(s: Pick<AppState, 'routines'>, session: ProgramSession, info: WeekInfo): Routine {
  const saved = s.routines.find((r) => r.id === planRoutineId(session));
  if (!saved) return sessionToRoutine(session, info.type, info.phase);
  const focusIds = new Set(session.exercises.filter((e) => e.focus).map((e) => e.id));
  const scale = (n: number, focus: boolean) => {
    const base = n + (info.phase === 'build' && focus ? 1 : 0);
    return info.type === 'ramp' ? Math.max(2, Math.round(base * 0.67)) : info.type === 'deload' ? Math.max(2, Math.round(base * 0.5)) : base;
  };
  return { ...saved, exercises: saved.exercises.map((e) => ({ ...e, sets: scale(e.sets, focusIds.has(e.exerciseId)) })) };
}

/** Start a workout from a routine, pre-filling weights from the last time each lift was done. */
export function buildWorkout(history: Workout[], routine: Routine | undefined): Workout {
  const sorted = [...history].sort((a, b) => b.startedAt - a.startedAt);
  const lastFor = (id: string) => sorted.flatMap((w) => w.exercises).find((e) => e.exerciseId === id);
  return {
    id: uid(),
    name: routine?.name ?? 'Workout',
    startedAt: Date.now(),
    exercises: (routine?.exercises ?? []).map((e) => {
      const prev = lastFor(e.exerciseId)?.sets.filter((x) => x.done);
      return {
        exerciseId: e.exerciseId,
        name: e.name,
        sets: Array.from({ length: e.sets }, (_, i) => ({ weight: prev?.[Math.min(i, prev.length - 1)]?.weight ?? 0, reps: e.reps, done: false })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Meal plan (no nuts, no fish). Values are USDA FoodData Central per 100 g, as eaten.
// ---------------------------------------------------------------------------

interface PlanFoodDef {
  name: string;
  per100g: Nutrients;
  /** Rounding step (g) when portions are scaled. */
  step: number;
  servingGrams?: number;
  servingLabel?: string;
  /** Multiply as-eaten grams by this to get raw/dry weight for shopping. */
  rawFactor?: number;
  rawLabel?: string;
}

const n = (calories: number, protein: number, carbs: number, fat: number, sugar: number, fiber: number): Nutrients => ({ calories, protein, carbs, fat, sugar, fiber });

export const PLAN_FOODS = {
  egg: { name: 'Eggs, whole, cooked', per100g: n(143, 12.6, 0.7, 9.5, 0.4, 0), step: 50, servingGrams: 50, servingLabel: '1 large egg' },
  eggWhite: { name: 'Egg whites', per100g: n(52, 10.9, 0.7, 0.2, 0.7, 0), step: 10 },
  greekYogurt: { name: 'Greek yogurt, nonfat plain', per100g: n(59, 10.2, 3.6, 0.4, 3.2, 0), step: 5 },
  cottage: { name: 'Cottage cheese, 2%', per100g: n(81, 10.5, 4.8, 2.3, 4.0, 0), step: 5 },
  oats: { name: 'Rolled oats, dry', per100g: n(379, 13.2, 67.7, 6.5, 1.1, 10.1), step: 5 },
  blueberries: { name: 'Blueberries', per100g: n(57, 0.7, 14.5, 0.3, 10.0, 2.4), step: 5 },
  strawberries: { name: 'Strawberries', per100g: n(32, 0.7, 7.7, 0.3, 4.9, 2.0), step: 5 },
  banana: { name: 'Banana', per100g: n(89, 1.1, 22.8, 0.3, 12.2, 2.6), step: 5, servingGrams: 118, servingLabel: '1 medium banana' },
  apple: { name: 'Apple', per100g: n(52, 0.3, 13.8, 0.2, 10.4, 2.4), step: 5, servingGrams: 180, servingLabel: '1 medium apple' },
  chicken: { name: 'Chicken breast, cooked', per100g: n(165, 31, 0, 3.6, 0, 0), step: 5, rawFactor: 1.33, rawLabel: 'raw' },
  turkey: { name: 'Ground turkey 93%, cooked', per100g: n(213, 27.1, 0, 11.6, 0, 0), step: 5, rawFactor: 1.33, rawLabel: 'raw' },
  beef: { name: 'Ground beef 95% lean, cooked', per100g: n(193, 29.2, 0, 7.6, 0, 0), step: 5, rawFactor: 1.33, rawLabel: 'raw' },
  pork: { name: 'Pork tenderloin, cooked', per100g: n(143, 26.2, 0, 3.5, 0, 0), step: 5, rawFactor: 1.3, rawLabel: 'raw' },
  rice: { name: 'White rice, cooked', per100g: n(130, 2.7, 28.2, 0.3, 0.1, 0.4), step: 10, rawFactor: 0.33, rawLabel: 'dry' },
  pasta: { name: 'Pasta, cooked', per100g: n(158, 5.8, 30.9, 0.9, 0.6, 1.8), step: 10, rawFactor: 0.44, rawLabel: 'dry' },
  potato: { name: 'Russet potato, baked', per100g: n(93, 2.5, 21.2, 0.1, 1.2, 2.2), step: 10, rawFactor: 1.1, rawLabel: 'raw' },
  sweetPotato: { name: 'Sweet potato, baked', per100g: n(90, 2.0, 20.7, 0.2, 6.5, 3.3), step: 10, rawFactor: 1.1, rawLabel: 'raw' },
  blackBeans: { name: 'Black beans, cooked', per100g: n(132, 8.9, 23.7, 0.5, 0.3, 8.7), step: 5 },
  tortilla: { name: 'Corn tortillas', per100g: n(218, 5.7, 44.6, 2.9, 0.6, 6.3), step: 5, servingGrams: 26, servingLabel: '1 small tortilla' },
  broccoli: { name: 'Broccoli, cooked', per100g: n(35, 2.4, 7.2, 0.4, 1.4, 3.3), step: 10 },
  greenBeans: { name: 'Green beans, cooked', per100g: n(35, 1.9, 7.9, 0.3, 1.4, 4.1), step: 10 },
  spinach: { name: 'Spinach, raw', per100g: n(23, 2.9, 3.6, 0.4, 0.4, 2.2), step: 5 },
  pepper: { name: 'Bell pepper', per100g: n(31, 1.0, 6.0, 0.3, 4.2, 2.1), step: 5 },
  avocado: { name: 'Avocado', per100g: n(160, 2.0, 8.5, 14.7, 0.7, 6.7), step: 5 },
  oliveOil: { name: 'Olive oil', per100g: n(884, 0, 0, 100, 0, 0), step: 1 },
  milk: { name: 'Milk, 2%', per100g: n(50, 3.3, 4.8, 2.0, 5.1, 0), step: 10 },
  whey: { name: 'Whey protein powder (check label)', per100g: n(400, 80, 10, 3.3, 3.3, 0), step: 5 },
  mozzarella: { name: 'Mozzarella, part-skim', per100g: n(254, 24.3, 2.8, 15.9, 1.1, 0), step: 5 },
  salsa: { name: 'Salsa', per100g: n(36, 1.5, 7.0, 0.2, 4.0, 1.9), step: 5 },
} as const satisfies Record<string, PlanFoodDef>;

export type FoodKey = keyof typeof PLAN_FOODS;

export interface PlanItem {
  food: FoodKey;
  grams: number;
}

export interface MealPlan {
  title: string;
  how: string;
  items: PlanItem[];
}

export interface DayTemplate {
  id: 'A' | 'B' | 'C';
  title: string;
  meals: Record<Meal, MealPlan>;
}

const it = (food: FoodKey, grams: number): PlanItem => ({ food, grams });

/**
 * Three rotating days, each ≈2,600 kcal / ~175–185 g protein as written
 * (the Lean-out target for a 6'0" / ~290 lb start). Portions are scaled to
 * your current calorie target automatically.
 */
export const DAY_TEMPLATES: DayTemplate[] = [
  {
    id: 'A',
    title: 'Chicken & rice day',
    meals: {
      breakfast: { title: 'Egg & oat bowl', how: 'Scramble the eggs and whites. Cook oats in the milk, top with blueberries.', items: [it('egg', 150), it('eggWhite', 100), it('oats', 70), it('blueberries', 100), it('milk', 150)] },
      lunch: { title: 'Chicken, rice & broccoli', how: 'Season the chicken, serve over rice with broccoli, olive oil and avocado.', items: [it('chicken', 150), it('rice', 300), it('broccoli', 150), it('oliveOil', 12), it('avocado', 40)] },
      dinner: { title: 'Beef, baked potato & green beans', how: 'Brown the beef, bake the potato, finish the green beans in olive oil.', items: [it('beef', 140), it('potato', 350), it('greenBeans', 150), it('oliveOil', 12)] },
      snacks: { title: 'Yogurt, banana & oats', how: 'Stir the oats into the yogurt and slice the banana on top.', items: [it('greekYogurt', 200), it('banana', 120), it('oats', 25)] },
    },
  },
  {
    id: 'B',
    title: 'Burrito bowl & pasta day',
    meals: {
      breakfast: { title: 'Protein oats', how: 'Cook oats in milk, stir in whey off the heat, add banana. Yogurt on the side.', items: [it('greekYogurt', 150), it('oats', 75), it('banana', 120), it('milk', 150), it('whey', 15)] },
      lunch: { title: 'Turkey burrito bowl', how: 'Crumble turkey with the beans, peppers and salsa. Warm the tortillas, top with cheese and avocado.', items: [it('turkey', 100), it('tortilla', 130), it('blackBeans', 130), it('mozzarella', 25), it('salsa', 60), it('pepper', 80), it('avocado', 40)] },
      dinner: { title: 'Chicken pasta with spinach', how: 'Toss pasta with sliced chicken, wilted spinach, olive oil and mozzarella.', items: [it('chicken', 130), it('pasta', 280), it('spinach', 60), it('oliveOil', 14), it('mozzarella', 20)] },
      snacks: { title: 'Cottage cheese, apple & egg', how: 'Hard-boil the egg ahead of time.', items: [it('cottage', 150), it('apple', 180), it('egg', 50)] },
    },
  },
  {
    id: 'C',
    title: 'Pork, sweet potato & beef bowl day',
    meals: {
      breakfast: { title: 'Egg tacos', how: 'Scramble eggs and whites into warm corn tortillas with salsa and avocado. Apple on the side.', items: [it('egg', 150), it('eggWhite', 100), it('tortilla', 90), it('salsa', 60), it('avocado', 50), it('apple', 150)] },
      lunch: { title: 'Pork, sweet potato & broccoli', how: 'Roast the tenderloin and sweet potato together; steam the broccoli, finish with olive oil.', items: [it('pork', 150), it('sweetPotato', 350), it('broccoli', 150), it('oliveOil', 12)] },
      dinner: { title: 'Beef rice bowl', how: 'Brown the beef, serve over rice with peppers and black beans.', items: [it('beef', 140), it('rice', 300), it('pepper', 120), it('blackBeans', 100), it('oliveOil', 10)] },
      snacks: { title: 'Yogurt, strawberries & oats', how: 'Layer in a bowl or jar.', items: [it('greekYogurt', 200), it('strawberries', 150), it('oats', 35)] },
    },
  },
];

/** Which template to eat by weekday (Sun–Sat): A B C A B C … Sunday repeats A. */
const TEMPLATE_BY_WEEKDAY: DayTemplate['id'][] = ['A', 'A', 'B', 'C', 'A', 'B', 'C'];
export const templateFor = (weekday: number) => DAY_TEMPLATES.find((d) => d.id === TEMPLATE_BY_WEEKDAY[weekday])!;

export const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snack' };

export const planFood = (key: FoodKey): Food => {
  const f: PlanFoodDef = PLAN_FOODS[key];
  return { id: `plan:${key}`, name: f.name, source: 'custom', per100g: f.per100g, servingGrams: f.servingGrams, servingLabel: f.servingLabel };
};

export const itemNutrients = (item: PlanItem): Nutrients => {
  const k = item.grams / 100;
  const p = PLAN_FOODS[item.food].per100g;
  return { calories: p.calories * k, protein: p.protein * k, carbs: p.carbs * k, fat: p.fat * k, sugar: p.sugar * k, fiber: p.fiber * k };
};

export const sumNutrients = (items: PlanItem[]): Nutrients =>
  items.reduce<Nutrients>(
    (a, i) => {
      const x = itemNutrients(i);
      return { calories: a.calories + x.calories, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat, sugar: a.sugar + x.sugar, fiber: a.fiber + x.fiber };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 },
  );

export const dayItems = (d: DayTemplate) => MEAL_ORDER.flatMap((m) => d.meals[m].items);
export const BASE_CALORIES = Math.round(sumNutrients(dayItems(DAY_TEMPLATES[0])).calories);

/** Scale a template to a calorie target, rounding each food to a practical step (whole eggs, 5 g, 1 g of oil). */
export function scaleDay(d: DayTemplate, calories: number): DayTemplate {
  const base = sumNutrients(dayItems(d)).calories;
  const k = calories / base;
  const meals = {} as DayTemplate['meals'];
  for (const m of MEAL_ORDER) {
    meals[m] = {
      ...d.meals[m],
      items: d.meals[m].items.map((i) => {
        const step = PLAN_FOODS[i.food].step;
        return { food: i.food, grams: Math.max(step, Math.round((i.grams * k) / step) * step) };
      }),
    };
  }
  return { ...d, meals };
}

/** "≈ 3 large eggs" style hint when a household measure is known. */
export function portionHint(item: PlanItem): string | null {
  const f: PlanFoodDef = PLAN_FOODS[item.food];
  if (!f.servingGrams || !f.servingLabel) return null;
  const count = item.grams / f.servingGrams;
  if (count < 0.75) return null;
  const label = f.servingLabel.replace(/^1 /, '');
  const c = Math.round(count * 2) / 2;
  return `≈ ${c} ${c === 1 ? label : label.replace(/(egg|banana|apple|tortilla)$/, '$1s')}`;
}

export function mealEntries(date: string, meal: Meal, items: PlanItem[]): FoodEntry[] {
  return items.map((i) => ({ id: uid(), date, meal, food: planFood(i.food), grams: i.grams, createdAt: Date.now() }));
}

export interface GroceryLine {
  key: FoodKey;
  name: string;
  /** As-eaten grams for the week. */
  grams: number;
  /** Raw/dry weight to buy, when it differs from as-eaten. */
  raw?: { grams: number; label: string };
}

/** Seven days of food scaled to `calories`, summed per ingredient. */
export function groceryList(calories: number): GroceryLine[] {
  const totals = new Map<FoodKey, number>();
  for (let wd = 0; wd < 7; wd++) {
    for (const i of dayItems(scaleDay(templateFor(wd), calories))) totals.set(i.food, (totals.get(i.food) ?? 0) + i.grams);
  }
  return [...totals.entries()]
    .map(([key, grams]) => {
      const f: PlanFoodDef = PLAN_FOODS[key];
      return { key, name: f.name, grams, raw: f.rawFactor && f.rawLabel ? { grams: Math.round((grams * f.rawFactor) / 10) * 10, label: f.rawLabel } : undefined };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
