import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Food, FoodEntry, Meal, Nutrients } from '../types';
import { entryNutrients, lookupBarcode, scale, searchOpenFoodFacts, searchUsda, totals } from '../lib/nutrition';
import { addDays, dayKey, round, uid } from '../lib/util';
import { Bar, NumberInput, Sheet } from '../components/ui';
import BarcodeScanner from '../components/BarcodeScanner';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function FoodPage() {
  const { state, update } = useStore();
  const [date, setDate] = useState(dayKey());
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const entries = state.foodLog.filter((e) => e.date === date);
  const tot = totals(entries);
  const t = state.targets;
  const isToday = date === dayKey();

  const copyMeal = (meal: Meal) => {
    const prev = state.foodLog.filter((e) => e.date === addDays(date, -1) && e.meal === meal);
    update((s) => ({ ...s, foodLog: [...s.foodLog, ...prev.map((e) => ({ ...e, id: uid(), date, createdAt: Date.now() }))] }));
  };

  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <h1>{isToday ? 'Today' : new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</h1>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="Next day">
          ›
        </button>
      </header>

      <section className="card">
        <Bar label="Calories" value={tot.calories} target={t.calories} unit="kcal" color="var(--accent)" />
        <Bar label="Protein" value={tot.protein} target={t.protein} color="var(--protein)" />
        <Bar label="Carbs" value={tot.carbs} target={t.carbs} color="var(--carbs)" />
        <Bar label="Fat" value={tot.fat} target={t.fat} color="var(--fat)" />
        <Bar label="Sugar" value={tot.sugar} target={t.sugar} color="var(--sugar)" invert />
        <Bar label="Fiber" value={tot.fiber} target={t.fiber} color="var(--fiber)" />
      </section>

      {MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal);
        const mt = totals(list);
        return (
          <section className="card" key={meal}>
            <div className="card-head">
              <h2>{cap(meal)}</h2>
              <span className="muted small">{round(mt.calories)} kcal</span>
            </div>
            {list.map((e) => {
              const n = entryNutrients(e);
              return (
                <button key={e.id} className="list-item" onClick={() => setEditing(e)}>
                  <div>
                    <div>{e.food.name}</div>
                    <div className="muted small">
                      {e.food.brand ? `${e.food.brand} · ` : ''}
                      {round(e.grams)} g · P {round(n.protein)} · C {round(n.carbs)} · F {round(n.fat)} · S {round(n.sugar)}
                    </div>
                  </div>
                  <span>{round(n.calories)}</span>
                </button>
              );
            })}
            <div className="row">
              <button className="btn ghost" onClick={() => setAdding(meal)}>
                + Add food
              </button>
              {list.length === 0 && state.foodLog.some((e) => e.date === addDays(date, -1) && e.meal === meal) && (
                <button className="btn ghost" onClick={() => copyMeal(meal)}>
                  Copy yesterday
                </button>
              )}
            </div>
          </section>
        );
      })}

      {adding && <AddFood meal={adding} date={date} onClose={() => setAdding(null)} />}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AddFood({ meal, date, onClose }: { meal: Meal; date: string; onClose: () => void }) {
  const { state, update } = useStore();
  const [tab, setTab] = useState<'search' | 'scan' | 'recent' | 'custom'>(state.recentFoods.length ? 'recent' : 'search');
  const [picked, setPicked] = useState<Food | null>(null);

  const add = (food: Food, grams: number, m: Meal) => {
    update((s) => ({
      ...s,
      foodLog: [...s.foodLog, { id: uid(), date, meal: m, food, grams, createdAt: Date.now() }],
      recentFoods: [food, ...s.recentFoods.filter((f) => f.id !== food.id)].slice(0, 50),
    }));
    onClose();
  };

  if (picked) {
    return (
      <Sheet title={picked.name} onClose={onClose}>
        <AmountPicker food={picked} meal={meal} onBack={() => setPicked(null)} onSave={add} />
      </Sheet>
    );
  }

  return (
    <Sheet title={`Add to ${cap(meal)}`} onClose={onClose}>
      <div className="segmented">
        {(['recent', 'search', 'scan', 'custom'] as const).map((x) => (
          <button key={x} className={tab === x ? 'active' : ''} onClick={() => setTab(x)}>
            {cap(x)}
          </button>
        ))}
      </div>
      {tab === 'search' && <Search onPick={setPicked} />}
      {tab === 'scan' && <Scan onPick={setPicked} />}
      {tab === 'recent' && (
        <FoodList foods={[...state.customFoods, ...state.recentFoods.filter((r) => !state.customFoods.some((c) => c.id === r.id))]} onPick={setPicked} empty="Foods you log or create show up here for one-tap re-logging." />
      )}
      {tab === 'custom' && (
        <CustomFood
          onSave={(f) => {
            update((s) => ({ ...s, customFoods: [f, ...s.customFoods] }));
            setPicked(f);
          }}
        />
      )}
    </Sheet>
  );
}

function FoodList({ foods, onPick, empty }: { foods: Food[]; onPick: (f: Food) => void; empty?: string }) {
  if (!foods.length) return <p className="muted small">{empty ?? 'No results.'}</p>;
  return (
    <div>
      {foods.map((f) => (
        <button key={f.id} className="list-item" onClick={() => onPick(f)}>
          <div>
            <div>{f.name}</div>
            <div className="muted small">
              {f.brand ? `${f.brand} · ` : ''}
              {f.source === 'usda' ? 'USDA' : f.source === 'off' ? 'Open Food Facts' : 'My food'} · per 100 g: P {round(f.per100g.protein)} C {round(f.per100g.carbs)} F {round(f.per100g.fat)}
            </div>
          </div>
          <span>{round(f.per100g.calories)}</span>
        </button>
      ))}
    </div>
  );
}

function Search({ onPick }: { onPick: (f: Food) => void }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ usda: Food[]; off: Food[] }>({ usda: [], off: [] });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const h = window.setTimeout(async () => {
      setBusy(true);
      const [usda, off] = await Promise.allSettled([searchUsda(q, state.settings.usdaApiKey, ctl.signal), searchOpenFoodFacts(q, ctl.signal)]);
      if (ctl.signal.aborted) return;
      setResults({ usda: usda.status === 'fulfilled' ? usda.value : [], off: off.status === 'fulfilled' ? off.value : [] });
      setErrors([usda, off].filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String(r.reason?.message ?? r.reason)));
      setBusy(false);
    }, 450);
    return () => {
      ctl.abort();
      window.clearTimeout(h);
    };
  }, [q, state.settings.usdaApiKey]);

  return (
    <div>
      <input autoFocus type="search" placeholder="Search foods (e.g. chicken breast, oats)" value={q} onChange={(e) => setQ(e.target.value)} />
      {busy && <p className="muted small">Searching…</p>}
      {errors.map((e) => (
        <p key={e} className="danger small">
          {e}
        </p>
      ))}
      {results.usda.length > 0 && <h3>Whole foods & brands (USDA)</h3>}
      <FoodList foods={results.usda} onPick={onPick} empty="" />
      {results.off.length > 0 && <h3>Packaged foods (Open Food Facts)</h3>}
      <FoodList foods={results.off} onPick={onPick} empty="" />
    </div>
  );
}

function Scan({ onPick }: { onPick: (f: Food) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const onCode = useCallback(
    async (code: string) => {
      setStatus(`Looking up ${code}…`);
      try {
        const f = await lookupBarcode(code);
        if (f) onPick(f);
        else setStatus(`No product found for ${code}. Try search, or create it as a custom food.`);
      } catch {
        setStatus('Lookup failed — check your connection.');
      }
    },
    [onPick],
  );
  return (
    <div>
      <BarcodeScanner key={key} onCode={onCode} />
      {status && (
        <p className="muted small">
          {status}{' '}
          <button className="link" onClick={() => (setStatus(null), setKey((k) => k + 1))}>
            Scan again
          </button>
        </p>
      )}
    </div>
  );
}

function AmountPicker({ food, meal, onBack, onSave, initialGrams, saveLabel = 'Add' }: { food: Food; meal: Meal; onBack?: () => void; onSave: (f: Food, grams: number, m: Meal) => void; initialGrams?: number; saveLabel?: string }) {
  const hasServing = !!food.servingGrams;
  const [mode, setMode] = useState<'serving' | 'grams'>(hasServing && !initialGrams ? 'serving' : 'grams');
  const [qty, setQty] = useState(initialGrams ?? (hasServing ? 1 : 100));
  const [m, setM] = useState<Meal>(meal);
  const grams = mode === 'serving' ? qty * (food.servingGrams ?? 100) : qty;
  const n = scale(food.per100g, grams);

  return (
    <div className="stack">
      {food.brand && <p className="muted">{food.brand}</p>}
      {hasServing && (
        <div className="segmented">
          <button className={mode === 'serving' ? 'active' : ''} onClick={() => (setMode('serving'), setQty(1))}>
            Servings{food.servingLabel ? ` (${food.servingLabel})` : ` (${food.servingGrams} g)`}
          </button>
          <button className={mode === 'grams' ? 'active' : ''} onClick={() => (setMode('grams'), setQty(food.servingGrams ?? 100))}>
            Grams
          </button>
        </div>
      )}
      <label>
        {mode === 'serving' ? 'Servings' : 'Grams'}
        <NumberInput value={qty} onChange={setQty} step={mode === 'serving' ? 0.25 : 1} />
      </label>
      <label>
        Meal
        <select value={m} onChange={(e) => setM(e.target.value as Meal)}>
          {MEALS.map((x) => (
            <option key={x} value={x}>
              {cap(x)}
            </option>
          ))}
        </select>
      </label>
      <NutrientGrid n={n} />
      <div className="row">
        {onBack && (
          <button className="btn ghost" onClick={onBack}>
            Back
          </button>
        )}
        <button className="btn" disabled={grams <= 0} onClick={() => onSave(food, grams, m)}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function NutrientGrid({ n }: { n: Nutrients }) {
  return (
    <div className="nutrient-grid">
      {(
        [
          ['kcal', n.calories],
          ['Protein', n.protein],
          ['Carbs', n.carbs],
          ['Fat', n.fat],
          ['Sugar', n.sugar],
          ['Fiber', n.fiber],
        ] as const
      ).map(([k, v]) => (
        <div key={k}>
          <strong>{round(v, k === 'kcal' ? 0 : 1)}</strong>
          <span className="muted small">{k}</span>
        </div>
      ))}
    </div>
  );
}

function EditEntry({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const { update } = useStore();
  return (
    <Sheet title={entry.food.name} onClose={onClose}>
      <AmountPicker
        food={entry.food}
        meal={entry.meal}
        initialGrams={entry.grams}
        saveLabel="Save"
        onSave={(_, grams, meal) => {
          update((s) => ({ ...s, foodLog: s.foodLog.map((e) => (e.id === entry.id ? { ...e, grams, meal } : e)) }));
          onClose();
        }}
      />
      <button
        className="btn danger-btn full"
        onClick={() => {
          update((s) => ({ ...s, foodLog: s.foodLog.filter((e) => e.id !== entry.id) }));
          onClose();
        }}
      >
        Delete entry
      </button>
    </Sheet>
  );
}

/** Custom foods are entered per serving (as printed on a label) and stored per 100 g. */
function CustomFood({ onSave }: { onSave: (f: Food) => void }) {
  const [name, setName] = useState('');
  const [servingGrams, setServingGrams] = useState(100);
  const [n, setN] = useState<Nutrients>({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 });
  const k = 100 / (servingGrams || 100);
  const fields: [keyof Nutrients, string][] = [
    ['calories', 'Calories'],
    ['protein', 'Protein (g)'],
    ['carbs', 'Carbs (g)'],
    ['fat', 'Fat (g)'],
    ['sugar', 'Sugar (g)'],
    ['fiber', 'Fiber (g)'],
  ];
  return (
    <div className="stack">
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom's lasagna" />
      </label>
      <label>
        Serving size (g)
        <NumberInput value={servingGrams} onChange={setServingGrams} />
      </label>
      <p className="muted small">Nutrition per serving:</p>
      <div className="grid-2">
        {fields.map(([key, label]) => (
          <label key={key}>
            {label}
            <NumberInput value={n[key]} onChange={(v) => setN({ ...n, [key]: v })} step={0.1} />
          </label>
        ))}
      </div>
      <button
        className="btn full"
        disabled={!name.trim() || servingGrams <= 0}
        onClick={() =>
          onSave({
            id: `custom:${uid()}`,
            name: name.trim(),
            source: 'custom',
            servingGrams,
            servingLabel: `${servingGrams} g`,
            per100g: { calories: n.calories * k, protein: n.protein * k, carbs: n.carbs * k, fat: n.fat * k, sugar: n.sugar * k, fiber: n.fiber * k },
          })
        }
      >
        Save food
      </button>
    </div>
  );
}
