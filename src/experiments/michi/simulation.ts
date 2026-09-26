import { PuraSim, type Drop } from '../../game/sim';
import { dominantHue, purityOf } from '../../game/palette';
import { OpenPlaySimulation } from '../open-play/simulation';
import { boardDrops } from '../boards';
import { spawnStage } from '../stages/simulation';
import { MICHI_BOARD, michiBoard, type MichiBoard, type Ring } from './boards';

/** A ring counts as delivered after its drop has rested inside it this long (as in 三つの道). */
const SETTLE_SECONDS = 0.45;
const RESTING_SPEED = 28;

export type RingState = { hue: Ring['hue']; gathered: number; purity: number; ready: boolean; inRing: boolean; delivered: boolean };

/** The original stages' stars: 3 at 99.5% purity, 2 at the requirement + 4 points, else 1. */
export function starsFor(purity: number, required: number) { return purity >= 0.995 ? 3 : purity >= required + 0.04 ? 2 : 1; }

export class MichiSimulation extends OpenPlaySimulation {
  board: MichiBoard | undefined;
  won: { stars: number; time: number; purity: number } | null = null;
  /** Separations made on this attempt (the chapter 3 boards offer a hint until the first). */
  separations = 0;
  private settling: Partial<Record<Ring['hue'], number>> = {};

  constructor(id: number) {
    super(12);
    this.board = michiBoard(id);
    this.reset();
  }

  override reset() {
    // The base constructor resets before this class's board exists.
    const def = this.board;
    if (!def) { super.reset(); return; }
    this.width = MICHI_BOARD.width; this.height = MICHI_BOARD.height;
    this.won = null; this.separations = 0; this.settling = {};
    this.core = new PuraSim();
    // Ring boards finish by delivery, so the core-and-quota check stays out of the way.
    this.core.level = def.rings ? { ...def, sandbox: true } : def;
    this.core.fusionPolicy = 'held-press';
    this.core.resize(this.width, this.height);
    this.core.obstacles = def.stones ?? [];
    const origin = def.origin ?? def.id;
    this.core.drops = def.layout ? boardDrops(def.layout)
      : spawnStage({ ...def, id: origin }, { stage: origin, scale: 'large', mix: 'press', sandboxCount: 30 }, this.width, this.height, this.core.pad);
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of ['cyan', 'rose', 'amber'] as const) this.core.quota[hue] += d.pigment[hue];
    this.core.onWin = (stars, time, purity) => { this.won = { stars, time, purity }; };
    this.observe();
  }

  override grab(id: number) {
    const before = this.splits.length;
    const grabbed = super.grab(id);
    if (this.splits.length > before) this.separations++;
    return grabbed;
  }

  /** The drop holding most of a colour: the one to bring to its ring. */
  private carrier(hue: Ring['hue']): Drop | undefined {
    return this.core.drops.reduce<Drop | undefined>((best, d) => !best || d.pigment[hue] > best.pigment[hue] ? d : best, undefined);
  }

  rings(): RingState[] {
    const def = this.board;
    if (!def?.rings) return [];
    return def.rings.map(ring => {
      const carrier = this.carrier(ring.hue);
      const total = this.core.quota[ring.hue];
      const gathered = carrier && total > 0 ? carrier.pigment[ring.hue] / total : 0;
      const purity = carrier ? purityOf(carrier.pigment) : 0;
      const ready = !!carrier && dominantHue(carrier.pigment) === ring.hue && gathered >= def.targetFrac - 1e-6 && purity >= def.purity;
      const inRing = !!carrier && Math.hypot(carrier.x - ring.x, carrier.y - ring.y) + carrier.r <= ring.r;
      return { hue: ring.hue, gathered, purity, ready, inRing, delivered: (this.settling[ring.hue] ?? 0) >= SETTLE_SECONDS };
    });
  }

  override tick(dt: number) {
    super.tick(dt);
    const def = this.board;
    if (!def?.rings || this.won || !(dt > 0)) return;
    const states = this.rings();
    for (const state of states) {
      const carrier = this.carrier(state.hue);
      const resting = !!carrier && Math.hypot(carrier.vx, carrier.vy) < RESTING_SPEED && this.core.grabbedId !== carrier.id;
      this.settling[state.hue] = state.ready && state.inRing && resting ? (this.settling[state.hue] ?? 0) + Math.min(dt, 1 / 12) : 0;
    }
    const after = this.rings();
    if (after.length && after.every(r => r.delivered)) {
      const purity = after.reduce((n, r) => n + r.purity, 0) / after.length;
      this.won = { stars: starsFor(purity, def.purity), time: this.core.elapsed, purity };
      this.core.won = true;
    }
  }
}
