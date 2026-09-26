import type { Drop } from '../game/sim';
import { emptyPigment, type HueId } from '../game/palette';

/**
 * A hand-placed drop on a designed board. `mix` gives shares of the drop's
 * mass that are other colours from the start (a drop that begins cloudy).
 */
export type BoardDrop = { x: number; y: number; r: number; hue: HueId; mix?: Partial<Record<HueId, number>> };

/** Simulation drops for a designed board; mass stays r² as everywhere else. */
export function boardDrops(layout: readonly BoardDrop[], firstId = 1000): Drop[] {
  return layout.map((d, i) => {
    const mass = d.r * d.r;
    const pigment = emptyPigment();
    let rest = 1;
    for (const [hue, share] of Object.entries(d.mix ?? {}) as [HueId, number][]) {
      pigment[hue] += mass * share; rest -= share;
    }
    pigment[d.hue] += mass * Math.max(0, rest);
    return { id: firstId + i, x: d.x, y: d.y, vx: 0, vy: 0, r: d.r, renderR: d.r, mass, pigment, freshness: 0 };
  });
}
