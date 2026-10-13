import { useEffect, useState } from 'react';
import type { Exercise } from '../types';

// Exercise data and images come from free-exercise-db (public domain / Unlicense):
// https://github.com/yuhonas/free-exercise-db — 870+ exercises, each with
// start/end position photos and step-by-step instructions.
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export const imageUrl = (path: string) => IMAGE_BASE + path;

let cache: Promise<Exercise[]> | null = null;

export function loadExercises(): Promise<Exercise[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/exercises.json`)
    .then((r) => r.json() as Promise<Exercise[]>)
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

export function useExercises() {
  const [list, setList] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadExercises().then(setList, () => setError('Could not load exercise library.'));
  }, []);
  return { list, error };
}

export const MUSCLES = [
  'chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'lower back', 'traps',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck',
];

/** Lower-body lifts progress in bigger jumps than upper-body ones. */
export const isLowerBody = (e: Pick<Exercise, 'primaryMuscles'>) =>
  e.primaryMuscles.some((m) => ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'].includes(m));
