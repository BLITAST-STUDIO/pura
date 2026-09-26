import { PuraSim, type Drop, type Tuning } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { emptyPigment, type HueId } from '../../game/palette';
import { OpenPlaySimulation } from '../open-play/simulation';
import { sandboxRadii } from '../stages/simulation';

/**
 * Free mode: no goal, no score. The player sets the count, the colours and
 * the feel of the liquid. Physics defaults are the legacy values; every
 * setting is explicit and player-controlled (no automatic boosts).
 */
export const FREE_BOARD = { width: 420, height: 560 };
export type FreeMix = 'same' | 'press' | 'all';
export type FreeSettings = {
  count: number; colors: 1 | 2 | 3; mix: FreeMix;
  /** 0 = watery … 1 = syrupy. */ viscosity: number;
  /** 0 = nimble … 1 = heavy. */ inertia: number;
  /** 0 = none … 1 = strong sliding friction. */ friction: number;
  /** 0 = none … 2 = twice the legacy pull. */ attraction: number;
};
export const FREE_DEFAULTS: FreeSettings = { count: 36, colors: 3, mix: 'press', viscosity: 0.2, inertia: 0.35, friction: 0, attraction: 1 };
export const FREE_PRESETS: Record<string, Partial<FreeSettings>> = {
  standard: { mix: 'press', viscosity: 0.2, inertia: 0.35, friction: 0, attraction: 1 },
  watery: { viscosity: 0, inertia: 0.15, friction: 0, attraction: 0.6 },
  syrupy: { viscosity: 0.85, inertia: 0.75, friction: 0.25, attraction: 1.2 },
  gather: { count: 60, colors: 1, mix: 'press', viscosity: 0.1, inertia: 0.2, friction: 0, attraction: 1.8 },
};
const HUES: HueId[] = ['cyan', 'rose', 'amber'];
const SIZE = 1.5; // the settled stage size
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function normalizeFree(input: Partial<FreeSettings>): FreeSettings {
  const s = { ...FREE_DEFAULTS, ...input };
  return {
    count: Math.round(clamp(s.count, 6, 60) / 6) * 6,
    colors: ([1, 2, 3] as const).includes(s.colors) ? s.colors : 3,
    mix: (['same', 'press', 'all'] as const).includes(s.mix) ? s.mix : 'press',
    viscosity: clamp(s.viscosity, 0, 1), inertia: clamp(s.inertia, 0, 1),
    friction: clamp(s.friction, 0, 1), attraction: clamp(s.attraction, 0, 2),
  };
}

/**
 * Map the player's 0–1 sliders onto physics. The standard preset lands close
 * to the legacy feel (damp .992 at viscosity .2 ≈ .9918; grab 36 at inertia .35).
 */
export function tuningFor(s: FreeSettings): Tuning {
  return {
    damp: 0.998 - s.viscosity * 0.03,
    grabK: 70 * Math.pow(0.12, s.inertia * 1.1) + 4,
    grabDamp: 13 - s.inertia * 8,
    friction: s.friction * 420,
    attraction: s.attraction,
  };
}

export function freeLayout(s: FreeSettings, width: number, height: number, pad: number): Drop[] {
  let seed = 0xf12ee + s.count * 31 + s.colors;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const radii = sandboxRadii(s.count);
  const hues = HUES.slice(0, s.colors);
  const drops: Drop[] = [];
  for (let i = 0; i < s.count; i++) {
    const hue = hues[i % hues.length];
    let r = (radii.rMin + random() * (radii.rMax - radii.rMin)) * SIZE;
    let x = 0, y = 0, placed = false;
    // Crowded boards (one colour, 60 drops) may have no room at full size:
    // shrink the drop a little and try again rather than start touching.
    for (let shrink = 0; shrink < 8 && !placed; shrink++, r *= 0.9) {
      for (let a = 0; a < 400; a++) {
        x = pad + r + random() * (width - pad * 2 - r * 2);
        y = pad + r + random() * (height - pad * 2 - r * 2);
        if (drops.every(d => Math.hypot(d.x - x, d.y - y) > d.r + r + (d.pigment[hue] > 0 ? 14 : 4))) { placed = true; break; }
      }
    }
    const pigment = emptyPigment();
    pigment[hue] = r * r;
    drops.push({ id: 1000 + i, x, y, vx: 0, vy: 0, r, renderR: r, mass: r * r, pigment, freshness: 0 });
  }
  return drops;
}

export class FreeSimulation extends OpenPlaySimulation {
  settings: FreeSettings | undefined;

  constructor(settings: Partial<FreeSettings> = {}) {
    super(12);
    this.settings = normalizeFree(settings);
    this.reset();
  }

  override reset() {
    if (!this.settings) { super.reset(); return; }
    this.width = FREE_BOARD.width; this.height = FREE_BOARD.height;
    this.core = new PuraSim();
    this.core.level = SANDBOX;
    this.core.resize(this.width, this.height);
    this.core.drops = freeLayout(this.settings, this.width, this.height, this.core.pad);
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of HUES) this.core.quota[hue] += d.pigment[hue];
    this.apply();
    this.observe();
  }

  /** Feel and mixing change live, without re-dealing the board. */
  configure(next: Partial<FreeSettings>) {
    this.settings = normalizeFree({ ...this.settings, ...next });
    this.apply();
  }

  private apply() {
    const s = this.settings!;
    this.core.tuning = tuningFor(s);
    this.core.fusionPolicy = s.mix === 'all' ? 'all-colors' : s.mix === 'press' ? 'held-press' : 'legacy';
  }
}

