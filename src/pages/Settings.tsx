import { useRef } from 'react';
import { useStore } from '../store';
import type { AppState, Goal, Sex, Targets } from '../types';
import { bmr, computeTargets, tdee } from '../lib/nutrition';
import { dayKey, KG_PER_LB, round } from '../lib/util';
import { NumberInput } from '../components/ui';

const ACTIVITY = [
  [1.2, 'Sedentary (desk job, little exercise)'],
  [1.375, 'Light (1–3 workouts/week)'],
  [1.55, 'Moderate (3–5 workouts/week)'],
  [1.725, 'Very active (6–7 workouts/week)'],
  [1.9, 'Athlete / physical job + training'],
] as const;

export default function SettingsPage() {
  const { state, update, replace } = useStore();
  const p = state.profile;
  const u = state.settings.units;
  const imperial = u === 'imperial';
  const file = useRef<HTMLInputElement>(null);

  const setProfile = (patch: Partial<typeof p>) => update((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  // Editing any target by hand switches to manual so the edit isn't overwritten.
  const setTarget = (k: keyof Targets, v: number) => update((s) => ({ ...s, settings: { ...s.settings, autoTargets: false }, targets: { ...s.targets, [k]: v } }));

  const totalIn = p.heightCm / 2.54;
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `healthapp-backup-${dayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as AppState;
      if (!data.profile || !Array.isArray(data.foodLog)) throw new Error('bad file');
      if (confirm('Replace all current data with this backup?')) replace(data);
    } catch {
      alert("That doesn't look like a HealthApp backup file.");
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Me</h1>
      </header>

      <section className="card stack">
        <h2>Profile</h2>
        <div className="segmented">
          {(['imperial', 'metric'] as const).map((x) => (
            <button key={x} className={u === x ? 'active' : ''} onClick={() => update((s) => ({ ...s, settings: { ...s.settings, units: x } }))}>
              {x === 'imperial' ? 'lb / mi' : 'kg / km'}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <label>
            Sex
            <select value={p.sex} onChange={(e) => setProfile({ sex: e.target.value as Sex })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Age
            <NumberInput value={p.age} onChange={(age) => setProfile({ age })} />
          </label>
          {imperial ? (
            <>
              <label>
                Height (ft)
                <NumberInput value={Math.floor(totalIn / 12)} onChange={(ft) => setProfile({ heightCm: (ft * 12 + round(totalIn % 12)) * 2.54 })} />
              </label>
              <label>
                Height (in)
                <NumberInput value={round(totalIn % 12)} onChange={(inch) => setProfile({ heightCm: (Math.floor(totalIn / 12) * 12 + inch) * 2.54 })} />
              </label>
            </>
          ) : (
            <label>
              Height (cm)
              <NumberInput value={round(p.heightCm)} onChange={(heightCm) => setProfile({ heightCm })} />
            </label>
          )}
          <label>
            Weight ({imperial ? 'lb' : 'kg'})
            <NumberInput value={round(imperial ? p.weightKg / KG_PER_LB : p.weightKg, 1)} step={0.1} onChange={(v) => setProfile({ weightKg: imperial ? v * KG_PER_LB : v })} />
          </label>
          <label>
            Goal
            <select value={p.goal} onChange={(e) => setProfile({ goal: e.target.value as Goal })}>
              <option value="lose">Lose fat</option>
              <option value="maintain">Maintain / recomp</option>
              <option value="gain">Build muscle</option>
            </select>
          </label>
        </div>
        <label>
          Activity level
          <select value={p.activity} onChange={(e) => setProfile({ activity: Number(e.target.value) })}>
            {ACTIVITY.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          BMR {round(bmr(p))} kcal · maintenance ≈ {round(tdee(p))} kcal/day
        </p>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h2>Daily targets</h2>
          <label className="inline">
            <input
              type="checkbox"
              checked={state.settings.autoTargets}
              onChange={(e) => {
                const autoTargets = e.target.checked;
                update((s) => ({ ...s, settings: { ...s.settings, autoTargets }, targets: autoTargets ? computeTargets(s.profile) : s.targets }));
              }}
            />
            Auto
          </label>
        </div>
        <p className="muted small">{state.settings.autoTargets
            ? 'These update automatically whenever you change your profile or log a new weight. Edit any number to set your own instead.'
            : 'Manual targets. Check Auto to go back to calculated targets.'}</p>
        <div className="grid-2">
          {(
            [
              ['calories', 'Calories (kcal)'],
              ['protein', 'Protein (g)'],
              ['carbs', 'Carbs (g)'],
              ['fat', 'Fat (g)'],
              ['sugar', 'Sugar limit (g)'],
              ['fiber', 'Fiber (g)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input type="number" inputMode="numeric" value={state.targets[k]} onChange={(e) => setTarget(k, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Food database</h2>
        <label>
          USDA API key (free)
          <input
            value={state.settings.usdaApiKey}
            placeholder="DEMO_KEY (limited to ~30 searches/hour)"
            onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, usdaApiKey: e.target.value.trim() } }))}
          />
        </label>
        <p className="muted small">
          Get a free key in 1 minute at{' '}
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
            fdc.nal.usda.gov/api-key-signup
          </a>{' '}
          (1,000 searches/hour). Packaged foods and barcodes use Open Food Facts, which needs no key.
        </p>
      </section>

      <section className="card stack">
        <h2>Your data</h2>
        <p className="muted small">Everything is stored only on this device. Export a backup regularly (e.g. to iCloud Drive or Google Drive) so you can restore it on a new phone.</p>
        <div className="row">
          <button className="btn ghost grow" onClick={exportData}>
            Export backup
          </button>
          <button className="btn ghost grow" onClick={() => file.current?.click()}>
            Import backup
          </button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </div>
      </section>

      <section className="card">
        <h2>Credits</h2>
        <p className="muted small">
          Exercise images & instructions: free-exercise-db (public domain). Food data: USDA FoodData Central and Open Food Facts (ODbL). Maps: © OpenStreetMap contributors.
        </p>
      </section>
    </div>
  );
}
