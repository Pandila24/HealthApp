import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Checkin, Meal, Units } from '../types';
import type { Tab } from '../App';
import { bmr, totals } from '../lib/nutrition';
import {
  BASE_CALORIES,
  CONDITIONING_KINDS,
  DAY_TEMPLATES,
  DEFAULT_PLAN,
  KG_TO_LB,
  MEAL_LABEL,
  MEAL_ORDER,
  PHASES,
  SESSIONS,
  WEEKDAY_NAMES,
  buildWorkout,
  conditioningFor,
  dayItems,
  dayPlan,
  groceryList,
  mealEntries,
  paceAdvice,
  planFood,
  planTargets,
  portionHint,
  routineForToday,
  scaleDay,
  sessionToRoutine,
  setsFor,
  sumNutrients,
  templateFor,
  weekInfo,
  weekNumber,
  type DayTemplate,
  type PlanItem,
  type ProgramSession,
} from '../lib/plan';
import { addDays, dayKey, formatDuration, fromDisplayWeight, round, toDisplayWeight, uid, weightUnit } from '../lib/util';
import { LineChart, NumberInput, Sheet } from '../components/ui';

type Section = 'overview' | 'meals' | 'workouts' | 'progress';
const SECTIONS: [Section, string][] = [
  ['overview', 'Overview'],
  ['meals', 'Meals'],
  ['workouts', 'Workouts'],
  ['progress', 'Check-in'],
];

const lenUnit = (u: Units) => (u === 'imperial' ? 'in' : 'cm');
const toDisplayLen = (cm: number, u: Units) => (u === 'imperial' ? cm / 2.54 : cm);
const fromDisplayLen = (v: number, u: Units) => (u === 'imperial' ? v * 2.54 : v);

export default function PlanPage({ go }: { go: (t: Tab) => void }) {
  const { state } = useStore();
  const [section, setSection] = useState<Section>('overview');
  const plan = state.plan;

  if (!plan.active) return <Setup />;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Plan</h1>
        <span className="muted small">Week {Math.max(1, weekNumber(plan))}</span>
      </header>
      <div className="segmented">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>
      {section === 'overview' && <Overview go={go} />}
      {section === 'meals' && <Meals />}
      {section === 'workouts' && <Workouts go={go} />}
      {section === 'progress' && <Progress />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function Setup() {
  const { state, update } = useStore();
  const u = state.settings.units;
  const p = state.profile;
  const [sex, setSex] = useState(p.sex);
  const [age, setAge] = useState(p.age);
  const [feet, setFeet] = useState(Math.floor(p.heightCm / 2.54 / 12));
  const [inch, setInch] = useState(round((p.heightCm / 2.54) % 12));
  const [cm, setCm] = useState(round(p.heightCm));
  const [weight, setWeight] = useState(round(toDisplayWeight(p.weightKg, u), 1));
  const [bf, setBf] = useState(state.plan.bodyFatPct ?? 0);
  const [start, setStart] = useState(dayKey());

  const heightCm = u === 'imperial' ? (feet * 12 + inch) * 2.54 : cm;
  const weightKg = fromDisplayWeight(weight, u);
  const valid = age >= 14 && heightCm > 120 && weightKg > 35 && (bf === 0 || (bf >= 5 && bf <= 60));
  const preview = valid ? planTargets({ sex, age, heightCm, weightKg, activity: DEFAULT_PLAN.activity, goal: 'lose' }, { ...DEFAULT_PLAN, startDate: start, bodyFatPct: bf || null, active: true }, start) : null;

  const begin = () => {
    const today = dayKey();
    update((s) => {
      const keep = s.routines.filter((r) => !r.id.startsWith('plan-'));
      return {
        ...s,
        profile: { ...s.profile, sex, age, heightCm, weightKg, activity: DEFAULT_PLAN.activity, goal: 'lose' },
        settings: { ...s.settings, autoTargets: true },
        routines: [...SESSIONS.map((x) => sessionToRoutine(x)), ...keep],
        weights: [...s.weights.filter((w) => w.date !== today), { date: today, kg: weightKg }],
        plan: {
          ...DEFAULT_PLAN,
          active: true,
          startDate: start,
          bodyFatPct: bf || null,
          conditioning: s.plan.conditioning,
          checkins: [{ id: uid(), date: today, kg: weightKg, ...(bf ? { bodyFatPct: bf } : {}), note: 'Starting point' }],
        },
      };
    });
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Plan</h1>
      </header>
      <section className="card stack">
        <h2>Set up your training plan</h2>
        <p className="muted small">
          A 5-day lift + conditioning program built for a lean, athletic, broad-shouldered, big-armed look, with calorie and macro targets and a nut-free, fish-free meal plan. No ice needed. Enter your starting numbers and the app does the rest.
        </p>
        <div className="grid-2">
          <label>
            Sex
            <select value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Age
            <NumberInput value={age} onChange={setAge} />
          </label>
          {u === 'imperial' ? (
            <>
              <label>
                Height (ft)
                <NumberInput value={feet} onChange={setFeet} />
              </label>
              <label>
                Height (in)
                <NumberInput value={inch} onChange={setInch} />
              </label>
            </>
          ) : (
            <label>
              Height (cm)
              <NumberInput value={cm} onChange={setCm} />
            </label>
          )}
          <label>
            Weight ({weightUnit(u)})
            <NumberInput value={weight} step={0.1} onChange={setWeight} />
          </label>
          <label>
            Body fat % (optional)
            <NumberInput value={bf} step={0.1} onChange={setBf} placeholder="e.g. 39.3" />
          </label>
        </div>
        <label>
          Week 1 starts
          <input type="date" value={start} onChange={(e) => setStart(e.target.value || dayKey())} />
        </label>
        {preview && (
          <p className="muted small">
            Starting targets: <strong>{preview.calories} kcal</strong> · {preview.protein} g protein · {preview.carbs} g carbs · {preview.fat} g fat. They update automatically as your weight and phase change.
          </p>
        )}
        <button className="btn big" onClick={begin} disabled={!valid}>
          Start plan
        </button>
        <p className="muted small">This saves your profile, switches to plan-driven daily targets, and adds the five program routines to Train. Your logged data is untouched.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function Overview({ go }: { go: (t: Tab) => void }) {
  const { state, update } = useStore();
  const today = dayKey();
  const plan = state.plan;
  const info = weekInfo(plan, today);
  const phase = PHASES[info.phase];
  const weekday = new Date().getDay();
  const dp = dayPlan(weekday);
  const advice = paceAdvice(state, today);
  const t = state.targets;
  const inSync = state.settings.autoTargets;
  const started = info.week >= 1;
  const daysToStart = plan.startDate ? Math.max(0, Math.round((Date.parse(plan.startDate) - Date.parse(today)) / 86_400_000)) : 0;
  const tmpl = scaleDay(templateFor(weekday), t.calories);
  const cond = conditioningFor(info);

  const weekAgo = Date.now() - 7 * 86_400_000;
  const lifts = state.workouts.filter((w) => w.startedAt > weekAgo).length;
  const condMin = plan.conditioning.filter((c) => c.date > addDays(today, -7)).reduce((a, c) => a + c.minutes, 0);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const loggedDays = last7.map((d) => state.foodLog.filter((e) => e.date === d)).filter((l) => l.length);
  const avgP = loggedDays.length ? loggedDays.reduce((a, l) => a + totals(l).protein, 0) / loggedDays.length : 0;
  const avgCal = loggedDays.length ? loggedDays.reduce((a, l) => a + totals(l).calories, 0) / loggedDays.length : 0;

  const startSession = (session: ProgramSession) => {
    if (state.activeWorkout && !confirm('A workout is already in progress. Discard it and start this one?')) return;
    update((s) => ({ ...s, activeWorkout: buildWorkout(s.workouts, routineForToday(s, session, info)) }));
    go('train');
  };

  const setPhase = (override: 'cut' | 'build' | null) =>
    update((s) => ({ ...s, plan: { ...s.plan, phaseOverride: override, calAdjust: 0 }, profile: { ...s.profile, goal: override === 'build' ? 'gain' : 'lose' } }));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>
            {started ? `Week ${info.week} · ${phase.label}` : `Starts in ${daysToStart} day${daysToStart === 1 ? '' : 's'}`}
          </h2>
          {info.type === 'deload' && <span className="small warn-btn" style={{ padding: '2px 8px', borderRadius: 8 }}>Deload</span>}
        </div>
        <p className="muted small">{phase.blurb}</p>
        {started && (
          <p className="small">
            <strong>Effort:</strong> {info.effort}.
            {info.dietBreak && ' This is a diet-break week: eat at maintenance.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Today · {WEEKDAY_NAMES[weekday]}</h2>
        {dp.kind === 'lift' && (
          <>
            <strong>{dp.session.name}</strong>
            <p className="muted small">
              {dp.session.focus} · {dp.session.exercises.length} exercises · {dp.session.exercises.reduce((a, e) => a + setsFor(e, info.type, info.phase), 0)} sets
            </p>
            <button className="btn full" onClick={() => startSession(dp.session)}>
              Start workout
            </button>
          </>
        )}
        {dp.kind === 'conditioning' && (
          <>
            <strong>{cond.title}</strong>
            <p className="muted small">{cond.detail}</p>
          </>
        )}
        {dp.kind === 'rest' && (
          <>
            <strong>Rest day</strong>
            <p className="muted small">No lifting. Easy 30–45 minute walk, steps goal {phase.steps}, and prep tomorrow's meals.</p>
          </>
        )}
        <p className="small" style={{ marginTop: 10 }}>
          <strong>Eat:</strong> Day {tmpl.id} · {tmpl.title} ({Math.round(sumNutrients(dayItems(tmpl)).calories)} kcal)
        </p>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h2>Daily targets</h2>
          <span className="muted small">{started ? phase.label : 'Preview'}</span>
        </div>
        <div className="nutrient-grid">
          {(
            [
              ['kcal', t.calories],
              ['protein g', t.protein],
              ['carbs g', t.carbs],
              ['fat g', t.fat],
              ['fiber g', t.fiber],
              ['sugar ≤ g', t.sugar],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <strong>{v}</strong>
              <span className="muted small">{label}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Maintenance is ≈ {Math.round((bmr(state.profile) * plan.activity) / 10) * 10} kcal at your current weight. Protein is 1 g per lb of lean mass{plan.bodyFatPct ? '' : ' (log a body-fat % in Check-in to sharpen this)'}. These update when you weigh in or change phase.
        </p>
        {!inSync && (
          <div className="row">
            <span className="small danger grow">Targets are set manually.</span>
            <button className="btn small-btn" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, autoTargets: true }, targets: planTargets(s.profile, s.plan) }))}>
              Use plan targets
            </button>
          </div>
        )}
        <div className="row">
          <span className="small muted grow">Manual nudge: {plan.calAdjust > 0 ? '+' : ''}{plan.calAdjust} kcal</span>
          <button className="btn ghost small-btn" onClick={() => update((s) => ({ ...s, plan: { ...s.plan, calAdjust: s.plan.calAdjust - 100 } }))}>
            −100
          </button>
          <button className="btn ghost small-btn" onClick={() => update((s) => ({ ...s, plan: { ...s.plan, calAdjust: s.plan.calAdjust + 100 } }))}>
            +100
          </button>
          {plan.calAdjust !== 0 && (
            <button className="btn ghost small-btn" onClick={() => update((s) => ({ ...s, plan: { ...s.plan, calAdjust: 0 } }))}>
              Reset
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Is it working?</h2>
        <p className="small">{advice.message}</p>
        {advice.delta !== 0 && (
          <button className="btn ghost small-btn" onClick={() => update((s) => ({ ...s, plan: { ...s.plan, calAdjust: s.plan.calAdjust + advice.delta } }))}>
            Apply {advice.delta > 0 ? '+' : ''}
            {advice.delta} kcal/day
          </button>
        )}
      </section>

      <section className="stats-row">
        <div className="stat card">
          <strong>{lifts}/5</strong>
          <span className="muted small">lifts / 7d</span>
        </div>
        <div className="stat card">
          <strong>{condMin}</strong>
          <span className="muted small">cardio min / 7d</span>
        </div>
        <div className="stat card">
          <strong>{loggedDays.length ? Math.round(avgP) : '—'}</strong>
          <span className="muted small">avg protein g{loggedDays.length ? ` · ${Math.round(avgCal)} kcal` : ''}</span>
        </div>
      </section>

      <section className="card stack">
        <h2>Phase</h2>
        {info.phase !== 'build' ? (
          <>
            <p className="muted small">Stay in lean-out until you are around 20–25% body fat (or your waist and mirror say so), then switch to the upper-body build.</p>
            <button
              className="btn ghost"
              onClick={() => confirm('Switch to the upper-body build phase? Calories go to a small surplus and arm/delt work gets an extra set.') && setPhase('build')}
            >
              Switch to upper-body build
            </button>
          </>
        ) : (
          <>
            <p className="muted small">Lean gain: aim for +0.25–0.5% body weight per week. If your waist climbs faster than your arms, drop back to lean-out.</p>
            <button className="btn ghost" onClick={() => setPhase('cut')}>
              Back to lean-out
            </button>
          </>
        )}
        <button
          className="btn ghost"
          onClick={() => confirm('End the plan? Your logs stay; daily targets go back to the standard formula.') && update((s) => ({ ...s, plan: { ...s.plan, active: false } }))}
        >
          End plan
        </button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export function Meals() {
  const { state, update } = useStore();
  const today = dayKey();
  const [pick, setPick] = useState<DayTemplate['id']>(templateFor(new Date().getDay()).id);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [groceries, setGroceries] = useState(false);
  const t = state.targets;
  const day = useMemo(() => scaleDay(DAY_TEMPLATES.find((d) => d.id === pick)!, t.calories), [pick, t.calories]);
  const tot = sumNutrients(dayItems(day));

  const log = (key: string, meal: Meal, items: PlanItem[]) => {
    update((s) => ({ ...s, foodLog: [...s.foodLog, ...mealEntries(today, meal, items)] }));
    setLogged((l) => new Set(l).add(key));
  };
  const logDay = () => {
    update((s) => ({ ...s, foodLog: [...s.foodLog, ...MEAL_ORDER.flatMap((m) => mealEntries(today, m, day.meals[m].items))] }));
    setLogged(new Set(MEAL_ORDER.map((m) => `${pick}:${m}`)));
  };

  return (
    <>
      <div className="segmented">
        {DAY_TEMPLATES.map((d) => (
          <button key={d.id} className={pick === d.id ? 'active' : ''} onClick={() => setPick(d.id)}>
            Day {d.id}
          </button>
        ))}
      </div>

      <section className="card stack">
        <div className="card-head">
          <h2>{day.title}</h2>
          <span className="muted small">{Math.round(tot.calories)} kcal</span>
        </div>
        <div className="nutrient-grid">
          {(
            [
              ['protein', tot.protein, t.protein],
              ['carbs', tot.carbs, t.carbs],
              ['fat', tot.fat, t.fat],
              ['fiber', tot.fiber, t.fiber],
              ['sugar', tot.sugar, t.sugar],
              ['kcal', tot.calories, t.calories],
            ] as const
          ).map(([label, v, target]) => (
            <div key={label}>
              <strong>{Math.round(v)}</strong>
              <span className="muted small">
                {label} / {target}
              </span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Portions are scaled to your {t.calories} kcal target ({BASE_CALORIES} as written). Weigh meat, rice and pasta <strong>cooked</strong>. Rotation: Mon A · Tue B · Wed C · Thu A · Fri B · Sat C · Sun A.
        </p>
        <button className="btn" onClick={logDay}>
          Log whole day to Food
        </button>
      </section>

      {MEAL_ORDER.map((m) => {
        const meal = day.meals[m];
        const x = sumNutrients(meal.items);
        const key = `${pick}:${m}`;
        return (
          <section className="card" key={m}>
            <div className="card-head">
              <h2>
                {MEAL_LABEL[m]} · {meal.title}
              </h2>
            </div>
            <p className="muted small">{meal.how}</p>
            {meal.items.map((i, idx) => (
              <div key={idx} className="list-item static">
                <div>
                  <div>{planFood(i.food).name}</div>
                  {portionHint(i) && <div className="muted small">{portionHint(i)}</div>}
                </div>
                <span className="small">{i.grams} g</span>
              </div>
            ))}
            <div className="row">
              <span className="muted small grow">
                {Math.round(x.calories)} kcal · P {Math.round(x.protein)} · C {Math.round(x.carbs)} · F {Math.round(x.fat)}
              </span>
              <button className="btn ghost small-btn" onClick={() => log(key, m, meal.items)}>
                {logged.has(key) ? 'Logged ✓' : 'Log meal'}
              </button>
            </div>
          </section>
        );
      })}

      <section className="card stack">
        <h2>Rules of the plan</h2>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>No nuts, no fish.</strong> Check labels: Worcestershire sauce and Caesar dressing contain anchovies; many bars, granola and trail mixes contain nuts or are made on shared lines.
          </li>
          <li>Swap proteins 1:1 by weight between chicken, turkey, beef and pork. Swap carbs 1:1 by calories (rice ↔ potato ↔ pasta).</li>
          <li>Hit protein every day. If calories run low, the yogurt, cottage cheese and whey are the easiest wins.</li>
          <li>Drink ~100 oz of water a day, more on lift days. Salt your food; do not fear it.</li>
          <li>Off-plan meal? Log it as best you can and carry on with the next meal. Do not skip or "make up for it".</li>
        </ul>
        <button className="btn ghost" onClick={() => setGroceries(true)}>
          Weekly grocery list
        </button>
      </section>

      {groceries && (
        <Sheet title="Weekly grocery list" onClose={() => setGroceries(false)}>
          <p className="muted small">One week of the A/B/C rotation at {t.calories} kcal. Cooked weights are what you eat; raw/dry is what to buy.</p>
          {groceryList(t.calories).map((g) => (
            <div key={g.key} className="list-item static">
              <div>
                <div>{g.name}</div>
                {g.raw && (
                  <div className="muted small">
                    ≈ {g.raw.grams} g {g.raw.label}
                  </div>
                )}
              </div>
              <span className="small">{g.grams.toLocaleString()} g</span>
            </div>
          ))}
          <p className="muted small">Also keep on hand: salt, pepper, garlic, cumin, paprika, hot sauce, mustard (check labels for fish and nuts).</p>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export function Workouts({ go }: { go: (t: Tab) => void }) {
  const { state, update } = useStore();
  const today = dayKey();
  const info = weekInfo(state.plan, today);
  const [open, setOpen] = useState<ProgramSession | null>(null);
  const cond = conditioningFor(info);
  const weekday = new Date().getDay();
  const [kind, setKind] = useState(CONDITIONING_KINDS[0]);
  const [minutes, setMinutes] = useState(0);
  const [hr, setHr] = useState(0);

  const start = (session: ProgramSession) => {
    if (state.activeWorkout && !confirm('A workout is already in progress. Discard it and start this one?')) return;
    update((s) => ({ ...s, activeWorkout: buildWorkout(s.workouts, routineForToday(s, session, info)) }));
    setOpen(null);
    go('train');
  };

  const addCond = () => {
    if (minutes <= 0) return;
    update((s) => ({ ...s, plan: { ...s.plan, conditioning: [{ id: uid(), date: dayKey(), kind, minutes, ...(hr > 0 ? { avgHr: hr } : {}) }, ...s.plan.conditioning] } }));
    setMinutes(0);
    setHr(0);
  };

  return (
    <>
      <section className="card">
        <h2>Weekly schedule</h2>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const dp = dayPlan(wd);
          const isToday = wd === weekday;
          return (
            <button key={wd} className="list-item" onClick={() => dp.kind === 'lift' && setOpen(dp.session)} style={isToday ? { fontWeight: 600 } : undefined}>
              <div>
                <div>
                  {WEEKDAY_NAMES[wd]}
                  {isToday && ' · today'}
                </div>
                <div className="muted small">
                  {dp.kind === 'lift' ? `${dp.session.name} — ${dp.session.focus}` : dp.kind === 'conditioning' ? cond.title : 'Rest + easy walk'}
                </div>
              </div>
              {dp.kind === 'lift' && <span className="muted">›</span>}
            </button>
          );
        })}
        <p className="muted small" style={{ marginTop: 8 }}>
          Five lifts, one conditioning day, one rest day. Upper-body work gets the most volume; legs stay thick for the athletic look. If you are still on your run/walk plan, Wednesday and Sunday are the slots for it.
        </p>
      </section>

      <section className="card stack">
        <h2>Conditioning (no ice)</h2>
        <div>
          <strong>{cond.title}</strong>
          <p className="muted small">{cond.detail}</p>
        </div>
        <p className="muted small">Daily steps goal: {PHASES[info.phase].steps}. Low-impact machines first — your joints will thank you at this body weight.</p>
        <div className="grid-2">
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {CONDITIONING_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Minutes
            <NumberInput value={minutes} onChange={setMinutes} placeholder="30" />
          </label>
          <label>
            Avg heart rate (optional)
            <NumberInput value={hr} onChange={setHr} placeholder="bpm" />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn full" onClick={addCond} disabled={minutes <= 0}>
              Log session
            </button>
          </div>
        </div>
        {state.plan.conditioning.slice(0, 6).map((c) => (
          <div key={c.id} className="list-item static">
            <div>
              <div>{c.kind}</div>
              <div className="muted small">
                {c.date}
                {c.avgHr ? ` · ${c.avgHr} bpm` : ''}
              </div>
            </div>
            <span className="small">{c.minutes} min</span>
            <button className="icon-btn" aria-label="Delete" onClick={() => update((s) => ({ ...s, plan: { ...s.plan, conditioning: s.plan.conditioning.filter((x) => x.id !== c.id) } }))}>
              ✕
            </button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>How to train it</h2>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>Double progression:</strong> work inside the rep range. When every set hits the top of the range, add weight (5 lb upper, 10 lb lower) and start at the bottom again.
          </li>
          <li>Warm up with 5 minutes on a bike or treadmill, then 2 light ramp-up sets of your first lift.</li>
          <li>Last set of each exercise: leave the reps in reserve shown on the Overview ({info.effort.toLowerCase()}).</li>
          <li>Every 6th week is a deload: half the sets, same or lighter weights. It is how the strength sticks.</li>
          <li>Planet Fitness has no barbell racks: Smith machine, dumbbells and cables cover the whole program. Mountain Side lets you swap in barbell versions (bench, RDL, hip thrust).</li>
          <li>Form beats weight. Stop a set when your form breaks, not when you are out of effort.</li>
        </ul>
      </section>

      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <p className="muted small">
            {open.focus}. Week {Math.max(1, info.week)} volume: {open.exercises.reduce((a, e) => a + setsFor(e, info.type, info.phase), 0)} sets.
          </p>
          {open.exercises.map((e) => (
            <div key={e.id} className="list-item static" style={{ alignItems: 'flex-start' }}>
              <div>
                <div>{e.name}</div>
                <div className="muted small">
                  Rest {formatDuration(e.rest)}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <span className="small">
                {setsFor(e, info.type, info.phase)} × {e.reps[0] === e.reps[1] ? e.reps[0] : `${e.reps[0]}–${e.reps[1]}`}
              </span>
            </div>
          ))}
          <button className="btn full" onClick={() => start(open)}>
            Start this workout
          </button>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Progress / check-ins
// ---------------------------------------------------------------------------

export function Progress() {
  const { state, update } = useStore();
  const u = state.settings.units;
  const plan = state.plan;
  const [date, setDate] = useState(dayKey());
  const [weight, setWeight] = useState(0);
  const [bf, setBf] = useState(0);
  const [waist, setWaist] = useState(0);
  const [arm, setArm] = useState(0);
  const [chest, setChest] = useState(0);
  const [note, setNote] = useState('');

  const empty = !(weight > 0 || bf > 0 || waist > 0 || arm > 0 || chest > 0 || note.trim());

  const save = () => {
    const c: Checkin = {
      id: uid(),
      date,
      ...(weight > 0 ? { kg: fromDisplayWeight(weight, u) } : {}),
      ...(bf > 0 ? { bodyFatPct: bf } : {}),
      ...(waist > 0 ? { waistCm: fromDisplayLen(waist, u) } : {}),
      ...(arm > 0 ? { armCm: fromDisplayLen(arm, u) } : {}),
      ...(chest > 0 ? { chestCm: fromDisplayLen(chest, u) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    update((s) => {
      const checkins = [...s.plan.checkins.filter((x) => x.date !== date || x.note === 'Starting point'), c].sort((a, b) => a.date.localeCompare(b.date));
      const latestBf = [...checkins].reverse().find((x) => x.bodyFatPct)?.bodyFatPct ?? s.plan.bodyFatPct;
      const latestKgEntry = [...s.weights.filter((w) => w.date !== date), ...(c.kg ? [{ date, kg: c.kg }] : [])].sort((a, b) => a.date.localeCompare(b.date));
      const newest = latestKgEntry[latestKgEntry.length - 1];
      return {
        ...s,
        weights: c.kg ? latestKgEntry : s.weights,
        profile: newest ? { ...s.profile, weightKg: newest.kg } : s.profile,
        plan: { ...s.plan, checkins, bodyFatPct: latestBf ?? null },
      };
    });
    setWeight(0);
    setBf(0);
    setWaist(0);
    setArm(0);
    setChest(0);
    setNote('');
  };

  const sorted = [...plan.checkins].sort((a, b) => a.date.localeCompare(b.date));
  const series = (pick: (c: Checkin) => number | undefined, conv: (v: number) => number) =>
    sorted.filter((c) => pick(c) !== undefined).map((c) => ({ label: c.date.slice(5), value: conv(pick(c)!) }));
  const weightSeries = [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ label: w.date.slice(5), value: toDisplayWeight(w.kg, u) }));
  const first = sorted[0];
  const latest = [...sorted].reverse();

  const w = state.profile.weightKg;
  const bfNow = plan.bodyFatPct;
  const leanLb = bfNow ? w * (1 - bfNow / 100) * KG_TO_LB : null;
  const fatLb = bfNow ? w * (bfNow / 100) * KG_TO_LB : null;

  const delta = (now: number | undefined, then: number | undefined, conv: (v: number) => number, unit: string, digits = 1) =>
    now !== undefined && then !== undefined && now !== then ? ` (${now - then > 0 ? '+' : ''}${round(conv(now) - conv(then), digits)} ${unit})` : '';

  return (
    <>
      <section className="card stack">
        <h2>Log a check-in</h2>
        <p className="muted small">Fill in whatever you measured. Weight and body fat update your targets right away. Measure the same way each time (morning, relaxed, same tape position).</p>
        <div className="grid-2">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || dayKey())} />
          </label>
          <label>
            Weight ({weightUnit(u)})
            <NumberInput value={weight} step={0.1} onChange={setWeight} placeholder={String(round(toDisplayWeight(w, u), 1))} />
          </label>
          <label>
            Body fat %
            <NumberInput value={bf} step={0.1} onChange={setBf} placeholder={bfNow ? String(bfNow) : 'e.g. 38'} />
          </label>
          <label>
            Waist ({lenUnit(u)})
            <NumberInput value={waist} step={0.1} onChange={setWaist} placeholder="at navel" />
          </label>
          <label>
            Arm ({lenUnit(u)})
            <NumberInput value={arm} step={0.1} onChange={setArm} placeholder="flexed, mid-bicep" />
          </label>
          <label>
            Chest ({lenUnit(u)})
            <NumberInput value={chest} step={0.1} onChange={setChest} placeholder="at nipple line" />
          </label>
        </div>
        <label>
          Notes
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Energy, sleep, injuries, wins…" />
        </label>
        <button className="btn" onClick={save} disabled={empty}>
          Save check-in
        </button>
      </section>

      {leanLb !== null && fatLb !== null && (
        <section className="card">
          <h2>Body composition</h2>
          <div className="nutrient-grid">
            <div>
              <strong>{round(toDisplayWeight(w, u), 1)}</strong>
              <span className="muted small">{weightUnit(u)} total</span>
            </div>
            <div>
              <strong>{round(u === 'imperial' ? leanLb : leanLb / KG_TO_LB, 1)}</strong>
              <span className="muted small">{weightUnit(u)} lean</span>
            </div>
            <div>
              <strong>{round(u === 'imperial' ? fatLb : fatLb / KG_TO_LB, 1)}</strong>
              <span className="muted small">{weightUnit(u)} fat</span>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Body fat {bfNow}%. Estimates from scales and calipers are rough; trust the trend, not a single number.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Trends</h2>
        <h3>Weight ({weightUnit(u)})</h3>
        <LineChart data={weightSeries} />
        <h3>Body fat (%)</h3>
        <LineChart data={series((c) => c.bodyFatPct, (v) => v)} />
        <h3>Waist ({lenUnit(u)})</h3>
        <LineChart data={series((c) => c.waistCm, (v) => toDisplayLen(v, u))} />
        <h3>Arm ({lenUnit(u)})</h3>
        <LineChart data={series((c) => c.armCm, (v) => toDisplayLen(v, u))} />
      </section>

      <section className="card">
        <h2>History</h2>
        {latest.length === 0 && <p className="muted small">Check-ins appear here.</p>}
        {latest.map((c) => (
          <div key={c.id} className="list-item static" style={{ alignItems: 'flex-start' }}>
            <div>
              <div>{c.date}</div>
              <div className="muted small">
                {[
                  c.kg !== undefined && `${round(toDisplayWeight(c.kg, u), 1)} ${weightUnit(u)}${delta(c.kg, first?.kg, (v) => toDisplayWeight(v, u), weightUnit(u))}`,
                  c.bodyFatPct !== undefined && `${c.bodyFatPct}% BF${delta(c.bodyFatPct, first?.bodyFatPct, (v) => v, 'pts')}`,
                  c.waistCm !== undefined && `waist ${round(toDisplayLen(c.waistCm, u), 1)} ${lenUnit(u)}${delta(c.waistCm, first?.waistCm, (v) => toDisplayLen(v, u), lenUnit(u))}`,
                  c.armCm !== undefined && `arm ${round(toDisplayLen(c.armCm, u), 1)} ${lenUnit(u)}${delta(c.armCm, first?.armCm, (v) => toDisplayLen(v, u), lenUnit(u))}`,
                  c.chestCm !== undefined && `chest ${round(toDisplayLen(c.chestCm, u), 1)} ${lenUnit(u)}`,
                  c.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <button className="icon-btn" aria-label="Delete check-in" onClick={() => confirm('Delete this check-in?') && update((s) => ({ ...s, plan: { ...s.plan, checkins: s.plan.checkins.filter((x) => x.id !== c.id) } }))}>
              ✕
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
