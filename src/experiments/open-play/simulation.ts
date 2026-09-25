import { PuraSim, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { emptyPigment, type HueId } from '../../game/palette';
import { FusionSimulation } from '../fusion-lab/simulation';

/**
 * M3 "入口プレイ": the inherited PURA rules on a small curated board.
 * Different colours bounce (G-05), a held slow push mixes them (G-06), and a
 * double tap separates a mixed drop (G-08). No goal, score or refill.
 */
export const OPEN_BOARD = { width: 600, height: 700 };
const DOUBLE_TAP_SECONDS = 0.32;

/**
 * Twelve drops, four per colour. Each colour has one close pair so the first
 * drag or light flick is likely to find a fusion; nothing touches at rest.
 */
export const OPEN_LAYOUT: { x: number; y: number; r: number; hue: HueId }[] = [
  { x: 150, y: 170, r: 38, hue: 'cyan' }, { x: 232, y: 205, r: 30, hue: 'cyan' },
  { x: 470, y: 560, r: 34, hue: 'cyan' }, { x: 140, y: 470, r: 32, hue: 'cyan' },
  { x: 420, y: 150, r: 36, hue: 'rose' }, { x: 490, y: 210, r: 30, hue: 'rose' },
  { x: 260, y: 580, r: 34, hue: 'rose' }, { x: 330, y: 330, r: 32, hue: 'rose' },
  { x: 130, y: 320, r: 34, hue: 'amber' }, { x: 470, y: 390, r: 38, hue: 'amber' },
  { x: 395, y: 290, r: 30, hue: 'amber' }, { x: 300, y: 470, r: 32, hue: 'amber' },
];

export class OpenPlaySimulation extends FusionSimulation {
  private lastTap: { id: number; t: number } | null = null;

  constructor() { super(); this.reset(); }

  override reset() {
    this.width = OPEN_BOARD.width; this.height = OPEN_BOARD.height;
    this.lastTap = null;
    this.core = new PuraSim();
    this.core.level = SANDBOX;
    // The inherited rules: same colour fuses, others bounce unless held and
    // pressed in slowly — 'held-press' makes that reachable for these sizes.
    this.core.fusionPolicy = 'held-press';
    this.core.resize(this.width, this.height);
    this.core.drops = OPEN_LAYOUT.map((d, i): Drop => {
      const pigment = emptyPigment();
      pigment[d.hue] = d.r * d.r;
      return { id: 1000 + i, x: d.x, y: d.y, vx: 0, vy: 0, r: d.r, renderR: d.r, mass: d.r * d.r, pigment, freshness: 0 };
    });
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of ['cyan', 'rose', 'amber'] as const) this.core.quota[hue] += d.pigment[hue];
    this.observe();
  }

  override resize(_width: number, _height: number) {
    // A fixed logical board keeps the curated distances on every screen.
    this.release(); this.core.resize(this.width, this.height);
  }

  /** A second touch on the same drop within 0.32 s separates it instead of grabbing. */
  override grab(id: number) {
    const drop = this.core.drops.find(d => d.id === id);
    if (!drop) return false;
    const now = this.core.time;
    const previous = this.lastTap;
    this.lastTap = { id, t: now };
    if (previous && previous.id === id && now - previous.t < DOUBLE_TAP_SECONDS) {
      this.lastTap = null;
      const before = { id, x: drop.x, y: drop.y, r: drop.r };
      if (this.core.splitAt(drop.x, drop.y)) {
        this.splits.push(before);
        this.core.pointerUp();
        return false;
      }
    }
    return super.grab(id);
  }
}
