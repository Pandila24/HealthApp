import type { AppState, Exercise } from '../types';
import { addDays, dayKey, distanceUnit, round, toDisplayDistance, toDisplayWeight, weightUnit } from './util';
import { totals } from './nutrition';
import { isLowerBody } from './exercises';

export interface Suggestion {
  id: string;
  area: 'nutrition' | 'training' | 'running' | 'body';
  title: string;
  body: string;
  /** Higher shows first. */
  priority: number;
}

const DAY = 86_400_000;

const PROTEIN_FOODS = 'Greek yogurt (~17 g per cup), chicken breast (~31 g per 100 g), a protein shake (~25 g), eggs (~6 g each), or cottage cheese (~25 g per cup)';

/**
 * Rule-based coaching. Runs entirely on-device and costs nothing; the rules are
 * the same heuristics the big apps use (double progression, 10% mileage rule,
 * protein pacing, adaptive calorie checks).
 */
export function buildSuggestions(s: AppState, exercises: Map<string, Exercise> | null, now = new Date()): Suggestion[] {
  const out: Suggestion[] = [];
  const today = dayKey(now);
  const hour = now.getHours();
  const u = s.settings.units;
  const t = s.targets;

  // ----- Nutrition -----
  const todays = s.foodLog.filter((e) => e.date === today);
  const tot = totals(todays);
  if (todays.length === 0 && hour >= 11) {
    out.push({ id: 'log-food', area: 'nutrition', priority: 60, title: 'Nothing logged yet today', body: 'Logging as you eat (not at night) is the single biggest predictor of accurate tracking.' });
  }
  const proteinLeft = t.protein - tot.protein;
  if (todays.length > 0 && proteinLeft > 30 && hour >= 14) {
    out.push({ id: 'protein', area: 'nutrition', priority: 70, title: `${round(proteinLeft)} g protein to go`, body: `Easy ways to close the gap: ${PROTEIN_FOODS}.` });
  }
  if (tot.sugar > t.sugar) {
    out.push({ id: 'sugar', area: 'nutrition', priority: 65, title: `Sugar is ${round(tot.sugar - t.sugar)} g over target`, body: 'Swap sweetened drinks and snacks for fruit, sparkling water or a higher-protein option for the rest of the day.' });
  }
  if (tot.calories > t.calories * 1.1) {
    out.push({ id: 'cal-over', area: 'nutrition', priority: 55, title: 'Over your calorie target', body: "One day doesn't matter — the weekly average does. Aim to land close to target the next couple of days rather than slashing intake." });
  }
  if (todays.length > 0 && hour >= 18 && tot.fiber < t.fiber * 0.5) {
    out.push({ id: 'fiber', area: 'nutrition', priority: 30, title: 'Fiber is low today', body: 'Beans, berries, oats, broccoli and chia seeds are easy fiber wins and help with fullness.' });
  }

  // 7-day adherence (needs ≥4 logged days to be meaningful)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i - 1));
  const logged = days.map((d) => s.foodLog.filter((e) => e.date === d)).filter((l) => l.length > 0);
  if (logged.length >= 4) {
    const avg = logged.reduce((a, l) => a + totals(l).calories, 0) / logged.length;
    const diff = avg - t.calories;
    if (Math.abs(diff) > t.calories * 0.08) {
      out.push({ id: 'week-cal', area: 'nutrition', priority: 45, title: `7-day average: ${round(avg)} kcal`, body: `That's ${round(Math.abs(diff))} kcal ${diff > 0 ? 'above' : 'below'} your target. If your weight trend isn't moving the way you want, this is why.` });
    }
  }

  // ----- Body weight -----
  const lastWeigh = [...s.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!lastWeigh || lastWeigh.date < addDays(today, -7)) {
    out.push({ id: 'weigh', area: 'body', priority: 25, title: 'Log your weight', body: 'Weigh in a few mornings a week (after the bathroom, before eating). The trend matters more than any single reading.' });
  }
  const recentW = s.weights.filter((w) => w.date >= addDays(today, -28)).sort((a, b) => a.date.localeCompare(b.date));
  if (recentW.length >= 4) {
    const change = recentW[recentW.length - 1].kg - recentW[0].kg;
    const weeks = Math.max(1, (Date.parse(recentW[recentW.length - 1].date) - Date.parse(recentW[0].date)) / (7 * DAY));
    const perWeek = change / weeks;
    const goal = s.profile.goal;
    if (goal === 'lose' && perWeek > -0.1) {
      out.push({ id: 'trend', area: 'body', priority: 50, title: 'Weight has stalled', body: 'Over the last few weeks your weight is flat. Consider trimming ~150 kcal/day or adding 2,000 daily steps.' });
    } else if (goal === 'lose' && perWeek < -0.01 * s.profile.weightKg) {
      out.push({ id: 'trend', area: 'body', priority: 50, title: 'Losing quickly', body: 'You are losing more than 1% of bodyweight per week, which risks muscle loss. Consider adding ~150 kcal/day.' });
    } else if (goal === 'gain' && perWeek < 0.05) {
      out.push({ id: 'trend', area: 'body', priority: 50, title: 'Not gaining yet', body: 'Your weight trend is flat. Add ~150 kcal/day (an extra snack) and reassess in 2 weeks.' });
    }
  }

  // ----- Training -----
  const workouts = [...s.workouts].sort((a, b) => b.startedAt - a.startedAt);
  const last = workouts[0];
  if (!last) {
    out.push({ id: 'first-workout', area: 'training', priority: 40, title: 'Start your first workout', body: 'Build a routine on the Train tab. A simple start: 3 full-body days a week (squat, push, pull, hinge, core).' });
  } else {
    const since = Math.floor((now.getTime() - last.startedAt) / DAY);
    if (since >= 3) {
      out.push({ id: 'gap', area: 'training', priority: 45, title: `${since} days since your last workout`, body: 'Even a 20-minute session keeps the habit going.' });
    }
    // Consecutive training days
    let streak = 0;
    for (let i = 0; i < 10; i++) {
      const d = addDays(today, -i);
      if (workouts.some((w) => dayKey(w.startedAt) === d)) streak++;
      else if (i > 0) break;
    }
    if (streak >= 6) {
      out.push({ id: 'rest', area: 'training', priority: 50, title: 'Take a rest day', body: `You've trained ${streak} days running. Muscles grow during recovery — take a day off or do an easy walk.` });
    }

    // Double progression on recent lifts
    const seen = new Set<string>();
    let added = 0;
    for (const w of workouts.slice(0, 6)) {
      for (const ex of w.exercises) {
        if (seen.has(ex.exerciseId) || added >= 3) continue;
        seen.add(ex.exerciseId);
        const done = ex.sets.filter((x) => x.done && x.reps > 0);
        if (done.length === 0 || done.every((x) => x.weight === 0)) continue;
        const top = Math.max(...done.map((x) => x.weight));
        const working = done.filter((x) => x.weight === top);
        const lower = exercises?.get(ex.exerciseId) ? isLowerBody(exercises.get(ex.exerciseId)!) : false;
        const minReps = Math.min(...working.map((x) => x.reps));
        const disp = round(toDisplayWeight(top, u), 1);
        if (minReps >= 12) {
          const jump = u === 'imperial' ? (lower ? 10 : 5) : lower ? 5 : 2.5;
          out.push({ id: `po-${ex.exerciseId}`, area: 'training', priority: 35, title: `Go heavier on ${ex.name}`, body: `You hit ${minReps}+ reps on every set at ${disp} ${weightUnit(u)}. Next time try ${round(disp + jump, 1)} ${weightUnit(u)} for 8 reps, then build back up.` });
        } else {
          out.push({ id: `po-${ex.exerciseId}`, area: 'training', priority: 20, title: `${ex.name}: add a rep`, body: `Last time: ${working.length}×${minReps} @ ${disp} ${weightUnit(u)}. Aim for one more rep on each set before adding weight (stop at 12, then increase).` });
        }
        added++;
      }
    }

    // Neglected muscle groups
    if (exercises && workouts.length >= 3) {
      const hit = new Set<string>();
      for (const w of workouts.filter((w) => w.startedAt > now.getTime() - 8 * DAY)) {
        for (const ex of w.exercises) exercises.get(ex.exerciseId)?.primaryMuscles.forEach((m) => hit.add(m));
      }
      const groups: Record<string, string[]> = {
        chest: ['chest'],
        back: ['lats', 'middle back'],
        legs: ['quadriceps', 'hamstrings', 'glutes'],
        shoulders: ['shoulders'],
        core: ['abdominals'],
      };
      const missed = Object.entries(groups).filter(([, ms]) => !ms.some((m) => hit.has(m))).map(([g]) => g);
      if (missed.length) {
        out.push({ id: 'balance', area: 'training', priority: 30, title: `Haven't trained: ${missed.join(', ')}`, body: 'Nothing in the last 8 days targeted these. Hitting each muscle group ~2×/week is optimal for growth.' });
      }
    }
  }

  // ----- Running -----
  const runs = [...s.runs].sort((a, b) => b.startedAt - a.startedAt);
  if (runs.length === 0) {
    out.push({ id: 'c25k', area: 'running', priority: 15, title: 'Ready to start running?', body: 'Try a run/walk session: 5 min brisk walk, then 8 rounds of 60 s easy jog + 90 s walk, 3× a week. Add 30 s of jogging each week.' });
  } else {
    const weekDist = (from: number, to: number) => runs.filter((r) => r.startedAt >= from && r.startedAt < to).reduce((a, r) => a + r.distanceM, 0);
    const n = now.getTime();
    const thisWeek = weekDist(n - 7 * DAY, n + 1);
    const lastWeek = weekDist(n - 14 * DAY, n - 7 * DAY);
    if (lastWeek > 0 && thisWeek > lastWeek * 1.1) {
      out.push({ id: '10pct', area: 'running', priority: 40, title: 'Mileage jumped this week', body: `${round(toDisplayDistance(thisWeek, u), 1)} ${distanceUnit(u)} vs ${round(toDisplayDistance(lastWeek, u), 1)} last week. Increasing more than ~10%/week raises injury risk — keep the next runs easy.` });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}
