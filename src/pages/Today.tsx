import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { totals } from '../lib/nutrition';
import { buildSuggestions } from '../lib/suggestions';
import { useExercises } from '../lib/exercises';
import { addDays, dayKey, distanceUnit, fromDisplayWeight, round, toDisplayDistance, toDisplayWeight, weightUnit } from '../lib/util';
import { Bar, LineChart, NumberInput, Ring } from '../components/ui';
import type { Tab } from '../App';

const AREA_ICON = { nutrition: '🍽', training: '🏋', running: '🏃', body: '⚖' } as const;

export default function Today({ go }: { go: (t: Tab) => void }) {
  const { state, update } = useStore();
  const { list } = useExercises();
  const today = dayKey();
  const u = state.settings.units;
  const t = state.targets;
  const tot = totals(state.foodLog.filter((e) => e.date === today));

  const exMap = useMemo(() => (list ? new Map(list.map((e) => [e.id, e])) : null), [list]);
  const suggestions = useMemo(() => buildSuggestions(state, exMap), [state, exMap]);

  const weekAgo = Date.now() - 7 * 86_400_000;
  const weekWorkouts = state.workouts.filter((w) => w.startedAt > weekAgo).length;
  const weekRun = state.runs.filter((r) => r.startedAt > weekAgo).reduce((a, r) => a + r.distanceM, 0);

  const [weight, setWeight] = useState(0);
  const logWeight = () => {
    if (weight <= 0) return;
    const kg = fromDisplayWeight(weight, u);
    update((s) => ({
      ...s,
      weights: [...s.weights.filter((w) => w.date !== today), { date: today, kg }],
      profile: { ...s.profile, weightKg: kg },
    }));
    setWeight(0);
  };
  const weights = [...state.weights]
    .filter((w) => w.date >= addDays(today, -90))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({ label: w.date.slice(5), value: toDisplayWeight(w.kg, u) }));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Today</h1>
        <span className="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </header>

      <section className="card today-summary" onClick={() => go('food')}>
        <Ring value={tot.calories} target={t.calories} />
        <div className="bars">
          <Bar label="Protein" value={tot.protein} target={t.protein} color="var(--protein)" />
          <Bar label="Carbs" value={tot.carbs} target={t.carbs} color="var(--carbs)" />
          <Bar label="Fat" value={tot.fat} target={t.fat} color="var(--fat)" />
          <Bar label="Sugar" value={tot.sugar} target={t.sugar} color="var(--sugar)" invert />
        </div>
      </section>

      <section className="stats-row">
        <button className="stat card" onClick={() => go('train')}>
          <strong>{weekWorkouts}</strong>
          <span className="muted small">workouts / 7d</span>
        </button>
        <button className="stat card" onClick={() => go('run')}>
          <strong>{round(toDisplayDistance(weekRun, u), 1)}</strong>
          <span className="muted small">{distanceUnit(u)} run / 7d</span>
        </button>
        <div className="stat card">
          <strong>{round(toDisplayWeight(state.profile.weightKg, u), 1)}</strong>
          <span className="muted small">{weightUnit(u)} body weight</span>
        </div>
      </section>

      <section className="card">
        <h2>Suggestions</h2>
        {suggestions.length === 0 && <p className="muted">You're on track. Nice work.</p>}
        <ul className="suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <li key={s.id}>
              <span className="sug-icon" aria-hidden>
                {AREA_ICON[s.area]}
              </span>
              <div>
                <strong>{s.title}</strong>
                <p className="muted small">{s.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Body weight</h2>
        <div className="row">
          <NumberInput value={weight} onChange={setWeight} step={0.1} placeholder={`Today's weight (${weightUnit(u)})`} aria-label="Today's weight" />
          <button className="btn" onClick={logWeight}>
            Log
          </button>
        </div>
        <LineChart data={weights} />
      </section>
    </div>
  );
}
