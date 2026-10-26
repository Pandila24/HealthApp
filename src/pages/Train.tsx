import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Exercise, Routine, Workout, WorkoutExercise } from '../types';
import { useExercises } from '../lib/exercises';
import { e1rm, formatDuration, fromDisplayWeight, round, toDisplayWeight, uid, weightUnit } from '../lib/util';
import { ExerciseDetail, ExerciseLibrary } from '../components/ExerciseViews';
import { NumberInput, Sheet } from '../components/ui';
import { buildWorkout } from '../lib/plan';

const STARTER_ROUTINES: Routine[] = [
  {
    id: 'starter-a',
    name: 'Full Body A',
    exercises: [
      { exerciseId: 'Barbell_Squat', name: 'Barbell Squat', sets: 3, reps: 8 },
      { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', sets: 3, reps: 8 },
      { exerciseId: 'Bent_Over_Barbell_Row', name: 'Bent Over Barbell Row', sets: 3, reps: 8 },
      { exerciseId: 'Plank', name: 'Plank', sets: 3, reps: 1 },
    ],
  },
  {
    id: 'starter-b',
    name: 'Full Body B',
    exercises: [
      { exerciseId: 'Romanian_Deadlift', name: 'Romanian Deadlift', sets: 3, reps: 8 },
      { exerciseId: 'Standing_Military_Press', name: 'Standing Military Press', sets: 3, reps: 8 },
      { exerciseId: 'Pullups', name: 'Pullups', sets: 3, reps: 6 },
      { exerciseId: 'Dumbbell_Lunges', name: 'Dumbbell Lunges', sets: 3, reps: 10 },
    ],
  },
];

export default function Train() {
  const { state, update } = useStore();
  const [library, setLibrary] = useState(false);
  const [editRoutine, setEditRoutine] = useState<Routine | null>(null);
  const [viewWorkout, setViewWorkout] = useState<Workout | null>(null);
  const active = state.activeWorkout;

  const start = (r?: Routine) => {
    update((s) => ({ ...s, activeWorkout: buildWorkout(s.workouts, r) }));
  };

  if (active) return <WorkoutSession />;

  const routines = state.routines.length ? state.routines : [];
  const history = [...state.workouts].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Train</h1>
        <button className="btn ghost" onClick={() => setLibrary(true)}>
          Exercises
        </button>
      </header>

      <button className="btn full big" onClick={() => start()}>
        Start empty workout
      </button>

      <section className="card">
        <div className="card-head">
          <h2>Routines</h2>
          <button className="btn ghost small-btn" onClick={() => setEditRoutine({ id: uid(), name: 'New routine', exercises: [] })}>
            + New
          </button>
        </div>
        {routines.length === 0 && (
          <div>
            <p className="muted small">No routines yet. Add a starter 2-day full-body program?</p>
            <button className="btn ghost" onClick={() => update((s) => ({ ...s, routines: STARTER_ROUTINES.map((r) => ({ ...r, id: uid() })) }))}>
              Add starter routines
            </button>
          </div>
        )}
        {routines.map((r) => (
          <div key={r.id} className="routine">
            <button className="routine-main" onClick={() => setEditRoutine(r)}>
              <strong>{r.name}</strong>
              <span className="muted small">{r.exercises.map((e) => e.name).join(' · ') || 'No exercises'}</span>
            </button>
            <button className="btn small-btn" onClick={() => start(r)} disabled={!r.exercises.length}>
              Start
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>History</h2>
        {history.length === 0 && <p className="muted small">Finished workouts appear here.</p>}
        {history.slice(0, 30).map((w) => {
          const sets = w.exercises.flatMap((e) => e.sets.filter((s) => s.done));
          const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
          return (
            <button key={w.id} className="list-item" onClick={() => setViewWorkout(w)}>
              <div>
                <div>{w.name}</div>
                <div className="muted small">
                  {new Date(w.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {w.finishedAt ? formatDuration((w.finishedAt - w.startedAt) / 1000) : ''} · {sets.length} sets
                </div>
              </div>
              <span className="small">
                {round(toDisplayWeight(vol, state.settings.units)).toLocaleString()} {weightUnit(state.settings.units)}
              </span>
            </button>
          );
        })}
      </section>

      {library && <ExerciseLibrary onClose={() => setLibrary(false)} />}
      {editRoutine && <RoutineEditor routine={editRoutine} onClose={() => setEditRoutine(null)} />}
      {viewWorkout && <WorkoutSummary workout={viewWorkout} onClose={() => setViewWorkout(null)} />}
    </div>
  );
}

function RoutineEditor({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const { state, update } = useStore();
  const [r, setR] = useState(routine);
  const [picking, setPicking] = useState(false);
  const exists = state.routines.some((x) => x.id === r.id);
  const save = () => {
    update((s) => ({ ...s, routines: exists ? s.routines.map((x) => (x.id === r.id ? r : x)) : [...s.routines, r] }));
    onClose();
  };
  const move = (i: number, d: number) => {
    const ex = [...r.exercises];
    const j = i + d;
    if (j < 0 || j >= ex.length) return;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    setR({ ...r, exercises: ex });
  };
  return (
    <Sheet title={exists ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <div className="stack">
        <label>
          Name
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
        </label>
        {r.exercises.map((e, i) => (
          <div key={i} className="routine-ex">
            <div className="grow">{e.name}</div>
            <label className="tiny">
              Sets
              <NumberInput value={e.sets} onChange={(v) => setR({ ...r, exercises: r.exercises.map((x, j) => (j === i ? { ...x, sets: Math.max(1, v) } : x)) })} />
            </label>
            <label className="tiny">
              Reps
              <NumberInput value={e.reps} onChange={(v) => setR({ ...r, exercises: r.exercises.map((x, j) => (j === i ? { ...x, reps: v } : x)) })} />
            </label>
            <div className="col">
              <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button className="icon-btn" onClick={() => setR({ ...r, exercises: r.exercises.filter((_, j) => j !== i) })} aria-label="Remove">
                ✕
              </button>
            </div>
          </div>
        ))}
        <button className="btn ghost" onClick={() => setPicking(true)}>
          + Add exercise
        </button>
        <div className="row">
          {exists && (
            <button
              className="btn danger-btn"
              onClick={() => {
                update((s) => ({ ...s, routines: s.routines.filter((x) => x.id !== r.id) }));
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <button className="btn grow" onClick={save} disabled={!r.name.trim()}>
            Save routine
          </button>
        </div>
      </div>
      {picking && (
        <ExerciseLibrary
          title="Add exercise"
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            setR({ ...r, exercises: [...r.exercises, { exerciseId: ex.id, name: ex.name, sets: 3, reps: 10 }] });
            setPicking(false);
          }}
        />
      )}
    </Sheet>
  );
}

function WorkoutSession() {
  const { state, update } = useStore();
  const { list } = useExercises();
  const exMap = useMemo(() => new Map((list ?? []).map((e) => [e.id, e])), [list]);
  const w = state.activeWorkout!;
  const u = state.settings.units;
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [now, setNow] = useState(Date.now());
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restLen, setRestLen] = useState(90);

  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(h);
  }, []);
  useEffect(() => {
    if (restEnd && now >= restEnd) {
      navigator.vibrate?.([200, 100, 200]);
      setRestEnd(null);
    }
  }, [now, restEnd]);

  const setW = (fn: (w: Workout) => Workout) => update((s) => (s.activeWorkout ? { ...s, activeWorkout: fn(s.activeWorkout) } : s));
  const setEx = (i: number, fn: (e: WorkoutExercise) => WorkoutExercise) => setW((w) => ({ ...w, exercises: w.exercises.map((e, j) => (j === i ? fn(e) : e)) }));

  const previous = (id: string) =>
    [...state.workouts]
      .sort((a, b) => b.startedAt - a.startedAt)
      .flatMap((x) => x.exercises)
      .find((e) => e.exerciseId === id)
      ?.sets.filter((s) => s.done);

  const bestE1rm = (id: string) => state.workouts.flatMap((x) => x.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets.filter((s) => s.done))).reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);

  const finish = () => {
    const cleaned = { ...w, finishedAt: Date.now(), exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length) };
    if (!cleaned.exercises.length && !confirm('No completed sets. Discard this workout?')) return;
    update((s) => ({ ...s, activeWorkout: null, workouts: cleaned.exercises.length ? [...s.workouts, cleaned] : s.workouts }));
  };

  return (
    <div className="page">
      <header className="page-head">
        <input className="title-input" value={w.name} onChange={(e) => setW((x) => ({ ...x, name: e.target.value }))} aria-label="Workout name" />
        <span className="muted">{formatDuration((now - w.startedAt) / 1000)}</span>
      </header>

      {w.exercises.map((ex, i) => {
        const prev = previous(ex.exerciseId);
        const best = bestE1rm(ex.exerciseId);
        const info = exMap.get(ex.exerciseId);
        return (
          <section className="card" key={i}>
            <div className="card-head">
              <button className="link h2" onClick={() => info && setDetail(info)}>
                {ex.name} {info && <span className="muted small">ⓘ</span>}
              </button>
              <button className="icon-btn" aria-label="Remove exercise" onClick={() => confirm(`Remove ${ex.name}?`) && setW((x) => ({ ...x, exercises: x.exercises.filter((_, j) => j !== i) }))}>
                ✕
              </button>
            </div>
            <table className="sets">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>Previous</th>
                  <th>{weightUnit(u)}</th>
                  <th>Reps</th>
                  <th>✓</th>
                </tr>
              </thead>
              <tbody>
                {ex.sets.map((s, k) => {
                  const p = prev?.[k];
                  const isPr = s.done && best > 0 && e1rm(s.weight, s.reps) > best;
                  return (
                    <tr key={k} className={s.done ? 'done' : ''}>
                      <td>
                        {k + 1}
                        {isPr && <span className="pr">PR</span>}
                      </td>
                      <td className="muted small">{p ? `${round(toDisplayWeight(p.weight, u), 1)}×${p.reps}` : '—'}</td>
                      <td>
                        <NumberInput value={round(toDisplayWeight(s.weight, u), 1)} step={u === 'imperial' ? 5 : 2.5} onChange={(v) => setEx(i, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === k ? { ...x, weight: fromDisplayWeight(v, u) } : x)) }))} aria-label="Weight" />
                      </td>
                      <td>
                        <NumberInput value={s.reps} onChange={(v) => setEx(i, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === k ? { ...x, reps: v } : x)) }))} aria-label="Reps" />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={s.done}
                          aria-label="Set done"
                          onChange={(e) => {
                            const done = e.target.checked;
                            setEx(i, (x) => ({ ...x, sets: x.sets.map((y, j) => (j === k ? { ...y, done } : y)) }));
                            if (done) setRestEnd(Date.now() + restLen * 1000);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row">
              <button className="btn ghost small-btn" onClick={() => setEx(i, (e) => ({ ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { weight: 0, reps: 10 }), done: false }] }))}>
                + Set
              </button>
              {ex.sets.length > 1 && (
                <button className="btn ghost small-btn" onClick={() => setEx(i, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
                  − Set
                </button>
              )}
            </div>
          </section>
        );
      })}

      <button className="btn ghost full" onClick={() => setPicking(true)}>
        + Add exercise
      </button>
      <div className="row">
        <button
          className="btn danger-btn"
          onClick={() => confirm('Discard this workout? Logged sets will be lost.') && update((s) => ({ ...s, activeWorkout: null }))}
        >
          Discard
        </button>
        <button className="btn grow" onClick={finish}>
          Finish workout
        </button>
      </div>

      {restEnd && (
        <div className="rest-bar">
          <span>Rest {formatDuration((restEnd - now) / 1000)}</span>
          <button className="btn ghost small-btn" onClick={() => setRestEnd(restEnd + 15000)}>
            +15s
          </button>
          <button className="btn ghost small-btn" onClick={() => setRestEnd(null)}>
            Skip
          </button>
        </div>
      )}
      <p className="muted small center">
        Rest timer:{' '}
        <select value={restLen} onChange={(e) => setRestLen(Number(e.target.value))} aria-label="Rest length">
          {[60, 90, 120, 180, 240].map((x) => (
            <option key={x} value={x}>
              {formatDuration(x)}
            </option>
          ))}
        </select>
      </p>

      {picking && (
        <ExerciseLibrary
          title="Add exercise"
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            const prev = previous(ex.id);
            setW((x) => ({ ...x, exercises: [...x.exercises, { exerciseId: ex.id, name: ex.name, sets: (prev?.length ? prev : [{ weight: 0, reps: 10, done: false }]).map((s) => ({ ...s, done: false })) }] }));
            setPicking(false);
          }}
        />
      )}
      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function WorkoutSummary({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { state, update } = useStore();
  const u = state.settings.units;
  return (
    <Sheet title={workout.name} onClose={onClose}>
      <p className="muted">
        {new Date(workout.startedAt).toLocaleString()} {workout.finishedAt && `· ${formatDuration((workout.finishedAt - workout.startedAt) / 1000)}`}
      </p>
      {workout.exercises.map((e, i) => (
        <div key={i} className="list-item static">
          <span>{e.name}</span>
          <span className="small muted">{e.sets.map((s) => `${round(toDisplayWeight(s.weight, u), 1)}×${s.reps}`).join(', ')}</span>
        </div>
      ))}
      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            const r: Routine = { id: uid(), name: workout.name, exercises: workout.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets.length, reps: e.sets[0]?.reps ?? 10 })) };
            update((s) => ({ ...s, routines: [...s.routines, r] }));
            onClose();
          }}
        >
          Save as routine
        </button>
        <button
          className="btn danger-btn"
          onClick={() => {
            if (!confirm('Delete this workout?')) return;
            update((s) => ({ ...s, workouts: s.workouts.filter((x) => x.id !== workout.id) }));
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </Sheet>
  );
}
