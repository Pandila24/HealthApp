import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Ctx, initialState } from '../../store';
import PlanPage, { Meals, Overview, Progress, Setup, Workouts } from '../Plan';
import { DEFAULT_PLAN, SESSIONS, sessionToRoutine } from '../../lib/plan';
import { computeTargets } from '../../lib/nutrition';
import { dayKey } from '../../lib/util';
import type { AppState } from '../../types';

// Server-render each Plan section against a realistic active-plan state: catches
// runtime errors and missing content without needing a browser.
const profile = { sex: 'male', age: 31, heightCm: 182.88, weightKg: 290 * 0.45359237, activity: 1.45, goal: 'lose' } as const;
const active = (patch: Partial<AppState['plan']> = {}): AppState => {
  const plan = { ...DEFAULT_PLAN, active: true, startDate: dayKey(), bodyFatPct: 39.3, ...patch };
  return {
    ...initialState,
    profile: { ...profile },
    targets: { calories: 2850, protein: 176, carbs: 359, fat: 79, sugar: 85, fiber: 40 },
    routines: SESSIONS.map((s) => sessionToRoutine(s)),
    weights: [{ date: dayKey(), kg: profile.weightKg }],
    plan: { ...plan, checkins: [{ id: 'c1', date: dayKey(), kg: profile.weightKg, bodyFatPct: 39.3, waistCm: 120, armCm: 40, note: 'Starting point' }] },
  };
};

const render = (ui: React.ReactElement, state: AppState) =>
  renderToStaticMarkup(<Ctx.Provider value={{ state, update: () => {}, replace: () => {} }}>{ui}</Ctx.Provider>);

describe('Plan page', () => {
  it('shows setup when no plan is active', () => {
    const html = render(<PlanPage go={() => {}} />, { ...initialState, targets: computeTargets(initialState.profile) });
    expect(html).toContain('Set up your training plan');
    expect(html).toContain('Start plan');
  });

  it('renders the setup form with a target preview', () => {
    const html = render(<Setup />, { ...initialState, profile: { ...profile }, plan: { ...DEFAULT_PLAN, bodyFatPct: 39.3 } });
    expect(html).toContain('Starting targets');
    expect(html).toContain('2850 kcal');
  });

  it('renders overview, meals, workouts and check-in for an active plan', () => {
    const s = active();
    const overview = render(<Overview go={() => {}} />, s);
    expect(overview).toContain('Re-entry');
    expect(overview).toContain('Daily targets');
    expect(overview).toContain('2850');

    const meals = render(<Meals />, s);
    expect(meals).toContain('Log whole day');
    expect(meals).toContain('Weekly grocery list');
    expect(meals).toContain('No nuts, no fish');

    const workouts = render(<Workouts go={() => {}} />, s);
    expect(workouts).toContain('Upper A');
    expect(workouts).toContain('Conditioning (no ice)');

    const progress = render(<Progress />, s);
    expect(progress).toContain('Log a check-in');
    expect(progress).toContain('Body composition');
    expect(progress).toContain('Starting point');
  });

  it('shows the build phase and a countdown before week 1', () => {
    const future = new Date(Date.now() + 3 * 86_400_000);
    expect(render(<Overview go={() => {}} />, active({ startDate: dayKey(future) }))).toContain('Starts in 3 days');
    expect(render(<Overview go={() => {}} />, active({ phaseOverride: 'build', startDate: '2020-01-06' }))).toContain('Upper-body build');
  });
});
