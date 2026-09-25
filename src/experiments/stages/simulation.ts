import { PuraSim, type Drop } from '../../game/sim';
import { getLevel, LEVELS, SANDBOX, SANDBOX_COUNT, type LevelDef } from '../../game/levels';
import { emptyPigment } from '../../game/palette';
import { OpenPlaySimulation } from '../open-play/simulation';

/**
 * M4 test play: the eight legacy stages and the sandbox on the new renderer.
 * Stage rules, colours, counts, target fractions, purity and stars are the
 * legacy `levels.ts` / `sim.ts` values. Two comparison axes are exposed so the
 * player can decide: drop size (legacy radii, or ×1.5 on the same board) and
 * the mixing rule (the reachable held-press, or the legacy overlap test).
 */
export const STAGE_BOARD = { width: 420, height: 560 };
const SAME_COLOUR_GAP = 14;
export type StageScale = 'large' | 'original';
export type MixRule = 'press' | 'legacy';
export const SCALE_FACTOR: Record<StageScale, number> = { large: 1.5, original: 1 };

export type StageSetup = { stage: number; scale: StageScale; mix: MixRule; sandboxCount: number };

/** The legacy sandbox's size rule: smaller drops as the board gets more crowded. */
export function sandboxRadii(total: number) {
  const perColor = Math.max(1, Math.round(total / 3));
  const crowd = perColor / 20;
  return { perColor, rMin: 8 + (1 - crowd) * 5, rMax: 13 + (1 - crowd) * 6 };
}

export function clampSandboxCount(n: number) {
  const stepped = Math.round((Number.isFinite(n) ? n : SANDBOX_COUNT.fallback) / SANDBOX_COUNT.step) * SANDBOX_COUNT.step;
  return Math.min(SANDBOX_COUNT.max, Math.max(SANDBOX_COUNT.min, stepped));
}

/**
 * The legacy spawner (random placement with shrinking gap tolerance), made
 * deterministic per stage so a retry is the same puzzle.
 */
export function spawnStage(def: LevelDef, setup: StageSetup, width: number, height: number, pad: number): Drop[] {
  let seed = 0x51f15e + def.id * 7919 + (def.sandbox ? setup.sandboxCount : 0);
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const k = SCALE_FACTOR[setup.scale];
  const sizes = def.sandbox ? sandboxRadii(setup.sandboxCount) : { perColor: def.perColor, rMin: def.rMin, rMax: def.rMax };
  const drops: Drop[] = [];
  const attempts = 400;
  for (const hue of def.colors) {
    for (let i = 0; i < sizes.perColor; i++) {
      const r = (sizes.rMin + random() * (sizes.rMax - sizes.rMin)) * k;
      let x = 0, y = 0;
      for (let a = 0; a < attempts; a++) {
        x = pad + r + random() * (width - pad * 2 - r * 2);
        y = pad + r + random() * (height - pad * 2 - r * 2);
        const gap = a < 150 ? 6 : a < 300 ? 2 : 0;
        // Same colours attract within 12 units; keep them past that so nothing
        // fuses before the player touches it (requirement 7.2).
        if (drops.every(d => Math.hypot(d.x - x, d.y - y) > d.r + r + (d.pigment[hue] > 0 ? SAME_COLOUR_GAP : gap))) break;
      }
      const pigment = emptyPigment();
      pigment[hue] = r * r;
      drops.push({ id: 1000 + drops.length, x, y, vx: 0, vy: 0, r, renderR: r, mass: r * r, pigment, freshness: 0 });
    }
  }
  return drops;
}

export class StageSimulation extends OpenPlaySimulation {
  setup: StageSetup | undefined;
  won: { stars: number; time: number; purity: number } | null = null;

  constructor(setup: StageSetup) {
    super(12);
    this.setup = { ...setup, sandboxCount: clampSandboxCount(setup.sandboxCount) };
    this.reset();
  }

  get def(): LevelDef { return (this.setup && getLevel(this.setup.stage)) || LEVELS[0]; }

  override reset() {
    // The base constructor resets before this class's setup exists.
    if (!this.setup) { super.reset(); return; }
    const def = this.def;
    this.width = STAGE_BOARD.width; this.height = STAGE_BOARD.height;
    this.won = null;
    this.core = new PuraSim();
    this.core.level = def;
    this.core.fusionPolicy = this.setup.mix === 'press' ? 'held-press' : 'legacy';
    this.core.resize(this.width, this.height);
    this.core.drops = spawnStage(def, this.setup, this.width, this.height, this.core.pad);
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of ['cyan', 'rose', 'amber'] as const) this.core.quota[hue] += d.pigment[hue];
    this.core.onWin = (stars, time, purity) => { this.won = { stars, time, purity }; };
    this.observe();
  }
}

export const STAGE_IDS = [...LEVELS.map(l => l.id), SANDBOX.id];

/**
 * The fixed drop height of the other screens (0.88 world units) suits their
 * large drops; legacy stage drops are far smaller and became tall pillars.
 * Scale height with radius at the approved open-play proportion instead.
 */
export const STAGE_HEIGHT_RATIO = 2.6;
export const stageDropHeight = (radius: number) => Math.min(0.88, radius * 0.01 * STAGE_HEIGHT_RATIO);
