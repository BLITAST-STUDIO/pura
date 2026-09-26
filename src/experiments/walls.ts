import { useEffect, useState } from 'react';

/**
 * How the play area's edge is shown (2026-09-27, RYO: the walls should be
 * visible, especially where drops are banked). Physics is the same in all:
 * - rim: a low, rounded rim standing on the wall line (trial default),
 * - line: a fine double line inlaid in the floor,
 * - none: the walls stay invisible (the look before 2026-09-27).
 */
export type Walls = 'rim' | 'line' | 'none';
export const WALLS: Walls[] = ['rim', 'line', 'none'];
export const WALL_LABELS: Record<Walls, string> = { rim: '縁', line: '線', none: 'なし（従来）' };
export const DEFAULT_WALLS: Walls = 'rim';

export function initialWalls(search?: string): Walls {
  try {
    const q = new URLSearchParams(search ?? location.search).get('walls');
    if (q && (WALLS as string[]).includes(q)) return q as Walls;
  } catch { /* no location */ }
  return DEFAULT_WALLS;
}

// One choice shared by the screen and its settings panel.
let current: Walls | null = null;
const listeners = new Set<(walls: Walls) => void>();

export function setWalls(walls: Walls) {
  current = walls;
  try {
    const url = new URL(location.href);
    if (walls === DEFAULT_WALLS) url.searchParams.delete('walls'); else url.searchParams.set('walls', walls);
    history.replaceState(history.state, '', url);
  } catch { /* no location */ }
  for (const listener of listeners) listener(walls);
}

export function useWalls(): Walls {
  const [walls, set] = useState<Walls>(() => current ?? (current = initialWalls()));
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return walls;
}
