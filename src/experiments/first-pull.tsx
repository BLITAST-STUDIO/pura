import { useEffect, useState, type RefObject } from 'react';
import { GhostTouch, pullGhost, type Ghost } from './ghost-touch';

/**
 * The first visit to a shot mode (ひとふで, カーリング): the welcome's pull
 * ghost, once, until the first shot (2026-09-27, RYO: let the onboarding show
 * that a pull can start anywhere, so a drop by the wall still gets full power).
 * The finger lands on open floor and a dashed line ties it to the aimed drop.
 */
const key = (mode: string) => `pura-flow-first-pull-${mode}`;

function seenBefore(mode: string) {
  try { return localStorage.getItem(key(mode)) !== null; } catch { return true; }
}

export function FirstPull({ mode, canvas, aimed, active, shot, straight = false }: {
  mode: 'hitofude' | 'curling';
  canvas: RefObject<HTMLCanvasElement | null>;
  /** The drop a pull would move, or null while nothing can be aimed (moving, held, another's turn). */
  aimed: () => number | null;
  /** The board is up and playing (not loading, paused or behind the menu). */
  active: boolean;
  /** The person has made their first shot here. */
  shot: boolean;
  /** Pull straight back (カーリング: the house is ahead) instead of away from the other drops. */
  straight?: boolean;
}) {
  const [seen, setSeen] = useState(() => seenBefore(mode));
  const [ghost, setGhost] = useState<Ghost | null>(null);
  useEffect(() => {
    if (!shot || seen) return;
    try { localStorage.setItem(key(mode), '1'); } catch { /* shown again next time */ }
    setSeen(true);
  }, [shot]);
  useEffect(() => {
    if (seen || !active) { setGhost(null); return; }
    let settled = 0;
    const timer = window.setInterval(() => {
      const id = aimed(), c = canvas.current;
      if (id === null || !c) { settled = 0; setGhost(null); return; }
      // A moment on the board before the finger shows.
      if (++settled < 4) return;
      let spots: { id: number; x: number; y: number }[] = [];
      try { spots = JSON.parse(c.dataset.drops ?? '[]').map((d: { id: number; screenX: number; screenY: number }) => ({ id: d.id, x: d.screenX, y: d.screenY })); } catch { return; }
      const drop = spots.find(s => s.id === id);
      if (!drop) return;
      const rect = c.getBoundingClientRect();
      const next = pullGhost(drop, straight ? [] : spots.filter(s => s !== drop), { w: rect.width, h: rect.height });
      // Keep the running animation unless the demonstration really moved.
      setGhost(g => (g && Math.hypot(g.x0 - next.x0, g.y0 - next.y0) + Math.hypot(g.x1 - next.x1, g.y1 - next.y1) < 4 ? g : next));
    }, 250);
    return () => clearInterval(timer);
  }, [seen, active]);
  return ghost && !seen ? <GhostTouch key={`${Math.round(ghost.x0)}-${Math.round(ghost.y0)}-${Math.round(ghost.x1)}`} ghost={ghost}/> : null;
}
