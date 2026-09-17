import { CHAPTERS } from './chapters';
export const PROGRESS_KEY = 'pura-flow-chapters-v1';
export type Progress = { v: 1; completed: number[]; last: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const valid = (id: unknown): id is number => typeof id === 'number' && CHAPTERS.some(c => c.id === id);
export function readProgress(storage?: StorageLike): Progress {
  const empty: Progress = { v: 1, completed: [], last: 1 };
  try {
    const raw = (storage ?? window.localStorage).getItem(PROGRESS_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw);
    if (data?.v !== 1) return empty;
    return { v: 1, completed: Array.isArray(data.completed) ? [...new Set<number>(data.completed.filter(valid))].sort() : [], last: valid(data.last) ? data.last : 1 };
  } catch { return empty; }
}
export function writeProgress(progress: Progress, storage?: StorageLike): boolean {
  try {
    const store = storage ?? window.localStorage;
    const old = readProgress(store);
    store.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, completed: [...new Set([...old.completed, ...progress.completed])].filter(valid).sort(), last: valid(progress.last) ? progress.last : 1 }));
    return true;
  } catch { return false; }
}
