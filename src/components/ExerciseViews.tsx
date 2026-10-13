import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../types';
import { imageUrl, MUSCLES, useExercises } from '../lib/exercises';
import { useStore } from '../store';
import { e1rm, round, toDisplayWeight, weightUnit } from '../lib/util';
import { Sheet } from './ui';

/** Flips between the start and end position photos so the movement reads like a GIF. */
export function ExerciseAnimation({ ex, size = 'large' }: { ex: Exercise; size?: 'large' | 'thumb' }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (ex.images.length < 2) return;
    const h = window.setInterval(() => setFrame((f) => (f + 1) % ex.images.length), size === 'thumb' ? 1200 : 900);
    return () => window.clearInterval(h);
  }, [ex, size]);
  if (!ex.images.length) return <div className={`ex-img ${size} placeholder`}>No image</div>;
  return (
    <div className={`ex-img ${size}`}>
      {ex.images.map((src, i) => (
        <img key={src} src={imageUrl(src)} alt={i === 0 ? `${ex.name} start position` : `${ex.name} end position`} loading="lazy" style={{ opacity: i === frame ? 1 : 0 }} />
      ))}
    </div>
  );
}

export function ExerciseDetail({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const { state } = useStore();
  const u = state.settings.units;
  const history = useMemo(
    () =>
      state.workouts
        .filter((w) => w.exercises.some((e) => e.exerciseId === ex.id))
        .sort((a, b) => b.startedAt - a.startedAt)
        .map((w) => ({ w, sets: w.exercises.filter((e) => e.exerciseId === ex.id).flatMap((e) => e.sets.filter((s) => s.done)) })),
    [state.workouts, ex.id],
  );
  const best = history.flatMap((h) => h.sets).reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);

  return (
    <Sheet title={ex.name} onClose={onClose}>
      <ExerciseAnimation ex={ex} />
      <div className="chips">
        {ex.primaryMuscles.map((m) => (
          <span key={m} className="chip primary">
            {m}
          </span>
        ))}
        {ex.secondaryMuscles.map((m) => (
          <span key={m} className="chip">
            {m}
          </span>
        ))}
        {ex.equipment && <span className="chip outline">{ex.equipment}</span>}
        <span className="chip outline">{ex.level}</span>
      </div>
      <h3>How to do it</h3>
      <ol className="instructions">
        {ex.instructions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <a className="small" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' exercise form')}`} target="_blank" rel="noreferrer">
        Watch form videos on YouTube ↗
      </a>
      {history.length > 0 && (
        <>
          <h3>Your history</h3>
          {best > 0 && (
            <p className="muted small">
              Best estimated 1-rep max: {round(toDisplayWeight(best, u))} {weightUnit(u)}
            </p>
          )}
          {history.slice(0, 8).map(({ w, sets }) => (
            <div key={w.id} className="list-item static">
              <span className="muted small">{new Date(w.startedAt).toLocaleDateString()}</span>
              <span className="small">{sets.map((s) => `${round(toDisplayWeight(s.weight, u), 1)}×${s.reps}`).join(', ')}</span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

const EQUIPMENT = ['barbell', 'dumbbell', 'body only', 'cable', 'machine', 'kettlebells', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'other'];

export function ExerciseLibrary({ onClose, onPick, title = 'Exercise library' }: { onClose: () => void; onPick?: (ex: Exercise) => void; title?: string }) {
  const { list, error } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [detail, setDetail] = useState<Exercise | null>(null);

  const filtered = useMemo(() => {
    if (!list) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return list
      .filter((e) => e.category !== 'stretching' || muscle || words.length)
      .filter((e) => !muscle || e.primaryMuscles.includes(muscle))
      .filter((e) => !equip || e.equipment === equip)
      .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
      .slice(0, 80);
  }, [list, q, muscle, equip]);

  return (
    <Sheet title={title} onClose={onClose}>
      <input type="search" placeholder="Search 870+ exercises" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Muscle">
          <option value="">All muscles</option>
          {MUSCLES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={equip} onChange={(e) => setEquip(e.target.value)} aria-label="Equipment">
          <option value="">All equipment</option>
          {EQUIPMENT.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      {error && <p className="danger">{error}</p>}
      {!list && !error && <p className="muted">Loading…</p>}
      <div className="ex-list">
        {filtered.map((e) => (
          <div key={e.id} className="ex-row">
            <button className="ex-row-main" onClick={() => setDetail(e)}>
              <ExerciseAnimation ex={e} size="thumb" />
              <div>
                <div>{e.name}</div>
                <div className="muted small">
                  {e.primaryMuscles.join(', ')} · {e.equipment ?? 'none'}
                </div>
              </div>
            </button>
            {onPick && (
              <button className="btn small-btn" onClick={() => onPick(e)}>
                Add
              </button>
            )}
          </div>
        ))}
      </div>
      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </Sheet>
  );
}
