import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Run, RunPoint } from '../types';
import { acceptPoint, splits } from '../lib/geo';
import { distanceUnit, formatDuration, formatPace, M_PER_MI, round, toDisplayDistance, uid } from '../lib/util';
import RunMap from '../components/RunMap';
import { BarChart, Sheet } from '../components/ui';

type Phase = 'idle' | 'running' | 'paused';

interface Live {
  startedAt: number;
  points: RunPoint[];
  distanceM: number;
  /** Moving time accumulated before the current running segment. */
  elapsedBefore: number;
  segmentStart: number | null;
}

// An in-progress run is mirrored to localStorage so it survives the phone
// killing the app in the background.
const LIVE_KEY = 'healthapp-live-run';
const loadLive = (): Live | null => {
  try {
    const l: Live | null = JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null');
    const lastT = l?.points[l.points.length - 1]?.t ?? l?.segmentStart ?? 0;
    if (l?.segmentStart && Date.now() - lastT > 2 * 60_000) {
      // The app was killed mid-run: count time only up to the last GPS fix, then pause.
      l.elapsedBefore += Math.max(0, lastT - l.segmentStart) / 1000;
      l.segmentStart = null;
    }
    return l;
  } catch {
    return null;
  }
};

export default function RunPage() {
  const { state, update } = useStore();
  const u = state.settings.units;
  const [live, setLive] = useState<Live | null>(loadLive);
  // Switching tabs mid-run just remounts this page, so a recent run keeps going.
  const [phase, setPhase] = useState<Phase>(live ? (live.segmentStart ? 'running' : 'paused') : 'idle');
  const [gpsAcc, setGpsAcc] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<Run | null>(null);
  const watch = useRef<number | null>(null);
  const wake = useRef<any>(null);

  useEffect(() => {
    if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live));
    else localStorage.removeItem(LIVE_KEY);
  }, [live]);

  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);

  // Watch GPS whenever a run exists (also while paused, to keep a fix warm).
  useEffect(() => {
    if (phase === 'idle') return;
    if (!('geolocation' in navigator)) {
      setError('GPS is not available on this device.');
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsAcc(pos.coords.accuracy);
        setError(null);
        if (phase !== 'running') return;
        const p: RunPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp, acc: pos.coords.accuracy };
        setLive((l) => {
          if (!l) return l;
          const { accept, meters } = acceptPoint(l.points[l.points.length - 1], p);
          return accept ? { ...l, points: [...l.points, p], distanceM: l.distanceM + meters } : l;
        });
      },
      (err) => setError(err.code === 1 ? 'Location permission denied. Enable it in your browser settings.' : 'Waiting for GPS signal…'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [phase]);

  // Keep the screen on while running — browsers pause GPS when the screen locks.
  useEffect(() => {
    if (phase !== 'running') return;
    const nav = navigator as any;
    const acquire = () => nav.wakeLock?.request('screen').then((l: any) => (wake.current = l)).catch(() => {});
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      wake.current?.release?.();
    };
  }, [phase]);

  const moving = live ? live.elapsedBefore + (live.segmentStart ? (now - live.segmentStart) / 1000 : 0) : 0;

  const start = () => {
    setLive({ startedAt: Date.now(), points: [], distanceM: 0, elapsedBefore: 0, segmentStart: Date.now() });
    setPhase('running');
  };
  const pause = () => {
    setLive((l) => l && { ...l, elapsedBefore: l.elapsedBefore + (l.segmentStart ? (Date.now() - l.segmentStart) / 1000 : 0), segmentStart: null });
    setPhase('paused');
  };
  const resume = () => {
    setLive((l) => l && { ...l, segmentStart: Date.now() });
    setPhase('running');
  };
  const stop = () => {
    if (!live) return;
    const run: Run = { id: uid(), startedAt: live.startedAt, durationSec: Math.round(moving), distanceM: live.distanceM, points: live.points };
    if (run.distanceM < 50 && !confirm('Less than 50 m recorded. Save anyway?')) {
      setLive(null);
      setPhase('idle');
      return;
    }
    update((s) => ({ ...s, runs: [...s.runs, run] }));
    setLive(null);
    setPhase('idle');
    setView(run);
  };

  const runs = useMemo(() => [...state.runs].sort((a, b) => b.startedAt - a.startedAt), [state.runs]);
  const weekly = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    const DAY = 86_400_000;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) {
      const from = monday.getTime() - i * 7 * DAY;
      const d = state.runs.filter((r) => r.startedAt >= from && r.startedAt < from + 7 * DAY).reduce((a, r) => a + r.distanceM, 0);
      out.push({ label: new Date(from).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), value: toDisplayDistance(d, u) });
    }
    return out;
  }, [state.runs, u]);

  if (phase !== 'idle' && live) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>{phase === 'running' ? 'Running' : 'Paused'}</h1>
          <span className={`gps ${gpsAcc == null ? '' : gpsAcc <= 15 ? 'good' : gpsAcc <= 35 ? 'ok' : 'bad'}`}>GPS {gpsAcc == null ? '…' : `±${Math.round(gpsAcc)} m`}</span>
        </header>
        {error && <p className="danger small">{error}</p>}
        <div className="run-stats">
          <div>
            <strong>{round(toDisplayDistance(live.distanceM, u), 2).toFixed(2)}</strong>
            <span className="muted small">{distanceUnit(u)}</span>
          </div>
          <div>
            <strong>{formatDuration(moving)}</strong>
            <span className="muted small">time</span>
          </div>
          <div>
            <strong>{formatPace(moving, live.distanceM, u)}</strong>
            <span className="muted small">avg /{distanceUnit(u)}</span>
          </div>
        </div>
        <RunMap points={live.points} follow />
        <div className="row run-controls">
          {phase === 'running' ? (
            <button className="btn big grow warn-btn" onClick={pause}>
              Pause
            </button>
          ) : (
            <>
              <button className="btn big grow" onClick={resume}>
                Resume
              </button>
              <button className="btn big grow danger-btn" onClick={stop}>
                Finish
              </button>
            </>
          )}
        </div>
        <p className="muted small center">Keep the app open with the screen on for accurate tracking.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Run</h1>
      </header>
      <button className="btn full big" onClick={start}>
        ▶ Start run
      </button>
      <p className="muted small center">Uses your phone's GPS. Distance, pace, splits and a route map are saved.</p>

      <section className="card">
        <h2>Weekly distance ({distanceUnit(u)})</h2>
        <BarChart data={weekly} format={(n) => n.toFixed(1)} />
      </section>

      <section className="card">
        <h2>History</h2>
        {runs.length === 0 && <p className="muted small">No runs yet.</p>}
        {runs.map((r) => (
          <button key={r.id} className="list-item" onClick={() => setView(r)}>
            <div>
              <div>
                {round(toDisplayDistance(r.distanceM, u), 2)} {distanceUnit(u)}
              </div>
              <div className="muted small">{new Date(r.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
            </div>
            <span className="small">
              {formatDuration(r.durationSec)} · {formatPace(r.durationSec, r.distanceM, u)}/{distanceUnit(u)}
            </span>
          </button>
        ))}
      </section>
      {view && <RunDetail run={view} onClose={() => setView(null)} />}
    </div>
  );
}

function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const { state, update } = useStore();
  const u = state.settings.units;
  const sp = splits(run.points, u === 'imperial' ? M_PER_MI : 1000);
  return (
    <Sheet title={new Date(run.startedAt).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} onClose={onClose}>
      <div className="run-stats">
        <div>
          <strong>{round(toDisplayDistance(run.distanceM, u), 2)}</strong>
          <span className="muted small">{distanceUnit(u)}</span>
        </div>
        <div>
          <strong>{formatDuration(run.durationSec)}</strong>
          <span className="muted small">time</span>
        </div>
        <div>
          <strong>{formatPace(run.durationSec, run.distanceM, u)}</strong>
          <span className="muted small">avg /{distanceUnit(u)}</span>
        </div>
      </div>
      {run.points.length > 1 && <RunMap points={run.points} />}
      {sp.length > 0 && (
        <>
          <h3>Splits</h3>
          {sp.map((s, i) => (
            <div key={i} className="list-item static">
              <span>
                {distanceUnit(u)} {i + 1}
              </span>
              <span>{formatDuration(s)}</span>
            </div>
          ))}
        </>
      )}
      <button
        className="btn danger-btn full"
        onClick={() => {
          if (!confirm('Delete this run?')) return;
          update((s) => ({ ...s, runs: s.runs.filter((r) => r.id !== run.id) }));
          onClose();
        }}
      >
        Delete run
      </button>
    </Sheet>
  );
}
