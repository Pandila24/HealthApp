import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import type { AppState } from './types';
import { computeTargets } from './lib/nutrition';

const KEY = 'healthapp-state-v1';

const defaultProfile = { sex: 'male', age: 30, heightCm: 178, weightKg: 82, activity: 1.55, goal: 'maintain' } as const;

export const initialState: AppState = {
  profile: { ...defaultProfile },
  targets: computeTargets({ ...defaultProfile }),
  settings: { units: 'imperial', usdaApiKey: '', autoTargets: true },
  foodLog: [],
  customFoods: [],
  recentFoods: [],
  routines: [],
  workouts: [],
  activeWorkout: null,
  runs: [],
  weights: [],
};

interface Store {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
}

const Ctx = createContext<Store | null>(null);

// All data lives in IndexedDB on this device. Nothing is sent anywhere except
// food-search queries to Open Food Facts / USDA and map tiles from OpenStreetMap.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    get<AppState>(KEY)
      .then((saved) => setState(saved ? { ...initialState, ...saved } : initialState))
      .catch(() => setState(initialState));
    navigator.storage?.persist?.();
  }, []);

  useEffect(() => {
    if (!state) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(KEY, state), 250);
  }, [state]);

  const update = useCallback(
    (fn: (s: AppState) => AppState) =>
      setState((s) => {
        if (!s) return s;
        const next = fn(s);
        // Keep targets in sync with profile changes (e.g. a new weigh-in).
        return next.settings.autoTargets && next.profile !== s.profile ? { ...next, targets: computeTargets(next.profile) } : next;
      }),
    [],
  );
  const replace = useCallback((s: AppState) => setState({ ...initialState, ...s }), []);

  if (!state) return <div className="loading">Loading…</div>;
  return <Ctx.Provider value={{ state, update, replace }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
