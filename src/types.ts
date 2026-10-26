export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Units = 'imperial' | 'metric';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** 1.2 sedentary … 1.9 very active */
  activity: number;
  goal: Goal;
}

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
}

export interface Settings {
  units: Units;
  /** USDA FoodData Central key; DEMO_KEY works but is heavily rate limited. */
  usdaApiKey: string;
  /** When true, targets are recomputed from the profile; otherwise manual. */
  autoTargets: boolean;
}

/** Nutrients per 100 g (or per 1 serving when `perServingOnly`). */
export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  source: 'usda' | 'off' | 'custom';
  per100g: Nutrients;
  /** Grams in one serving, if known. */
  servingGrams?: number;
  servingLabel?: string;
  barcode?: string;
}

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  meal: Meal;
  food: Food;
  grams: number;
  createdAt: number;
}

export interface SetLog {
  weight: number; // stored in kg
  reps: number;
  done: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  sets: SetLog[];
}

export interface Workout {
  id: string;
  name: string;
  startedAt: number;
  finishedAt?: number;
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface Routine {
  id: string;
  name: string;
  exercises: { exerciseId: string; name: string; sets: number; reps: number }[];
}

export interface RunPoint {
  lat: number;
  lng: number;
  t: number;
  acc: number;
}

export interface Run {
  id: string;
  startedAt: number;
  durationSec: number; // moving time
  distanceM: number;
  points: RunPoint[];
  notes?: string;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export type PlanPhaseId = 'ramp' | 'cut' | 'build';

/** A body check-in: any subset of these can be filled in. Lengths are stored in cm. */
export interface Checkin {
  id: string;
  date: string; // YYYY-MM-DD
  kg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  armCm?: number;
  chestCm?: number;
  note?: string;
}

/** Non-lifting conditioning (bike, incline walk, elliptical, etc.). */
export interface ConditioningLog {
  id: string;
  date: string;
  kind: string;
  minutes: number;
  avgHr?: number;
  note?: string;
}

export interface PlanState {
  active: boolean;
  /** Day week 1 starts (YYYY-MM-DD). */
  startDate: string;
  /** Force a phase; null = automatic (re-entry for weeks 1–2, then lean-out). */
  phaseOverride: 'cut' | 'build' | null;
  /** Latest body-fat estimate, used to size protein from lean mass. */
  bodyFatPct: number | null;
  /** Activity multiplier used for maintenance calories while on the plan. */
  activity: number;
  /** Manual calorie nudge (kcal/day) added to the calculated target. */
  calAdjust: number;
  checkins: Checkin[];
  conditioning: ConditioningLog[];
}

export interface AppState {
  profile: Profile;
  targets: Targets;
  settings: Settings;
  foodLog: FoodEntry[];
  customFoods: Food[];
  recentFoods: Food[];
  routines: Routine[];
  plan: PlanState;
  workouts: Workout[];
  activeWorkout: Workout | null;
  runs: Run[];
  weights: WeightEntry[];
}

export interface Exercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}
