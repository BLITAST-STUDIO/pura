import { PuraSim, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { dominantHue, emptyPigment, type HueId } from '../../game/palette';
import { FusionSimulation } from '../fusion-lab/simulation';
import { sandboxRadii } from '../stages/simulation';

/**
 * エンドレス (2026-09-27, RYO: a stress-relief mode apart from 自由, which is
 * more a gallery or an aquarium. No rules to think about: gather the scattered
 * colours; when all three are sorted, a small reward; then they scatter again,
 * endlessly, like bubble wrap or a pop-it).
 *
 * The inherited rules only: the same colour fuses on touch, other colours
 * bounce and never mix, so a round cannot go wrong. Sorted = one drop per
 * colour. Then each big drop pops in turn (the split spray and sound) into
 * the next round's drops of its colour, spread over the board.
 */
export const ENDLESS_BOARD = { width: 420, height: 560 };
/** The first round is short; later rounds pick one of these. */
export const ENDLESS_COUNTS = [18, 24, 30] as const;
/** Seconds from sorting to the first pop (the chime and glow play first), and between pops. */
export const POP_AFTER = 1.4, POP_GAP = 0.18;
const HUES: HueId[] = ['cyan', 'rose', 'amber'];
const SIZE = 1.5; // the settled stage size, as in 自由
/** Same-colour drops start this far apart (beyond the legacy pull), others a little. */
const SAME_GAP = 16, OTHER_GAP = 5;

type Spot = { x: number; y: number; r: number };

/**
 * A fresh scatter: `count` drops, colours in turn, nowhere touching each
 * other or the `keepClear` drops (the big drops still waiting to pop).
 */
export function scatter(count: number, random: () => number, width: number, height: number, pad: number, keepClear: Spot[] = []): { x: number; y: number; r: number; hue: HueId }[] {
  const radii = sandboxRadii(count);
  const out: { x: number; y: number; r: number; hue: HueId }[] = [];
  for (let i = 0; i < count; i++) {
    const hue = HUES[i % 3];
    let r = (radii.rMin + random() * (radii.rMax - radii.rMin)) * SIZE;
    let x = 0, y = 0, placed = false;
    for (let shrink = 0; shrink < 8 && !placed; shrink++, r *= 0.9) {
      for (let a = 0; a < 400; a++) {
        x = pad + r + random() * (width - pad * 2 - r * 2);
        y = pad + r + random() * (height - pad * 2 - r * 2);
        if (out.every(d => Math.hypot(d.x - x, d.y - y) > d.r + r + (d.hue === hue ? SAME_GAP : OTHER_GAP))
          && keepClear.every(d => Math.hypot(d.x - x, d.y - y) > d.r + r + SAME_GAP)) { placed = true; break; }
      }
    }
    out.push({ x, y, r, hue });
  }
  return out;
}

/** Sorted: every colour on the board is down to one drop. */
export function isSorted(drops: readonly Drop[]): boolean {
  const seen = new Set<HueId>();
  for (const d of drops) {
    const hue = dominantHue(d.pigment);
    if (seen.has(hue)) return false;
    seen.add(hue);
  }
  return drops.length > 0;
}

export class EndlessSimulation extends FusionSimulation {
  /** Rounds sorted on this screen. */
  sorted = 0;
  /** The colour whose fusion finished the last round (its chime rings). */
  lastHue: HueId = 'cyan';
  phase: 'gather' | 'sorted' = 'gather';
  private since = 0;
  private popped = 0;
  private order: HueId[] = [];
  private next: { x: number; y: number; r: number; hue: HueId }[] = [];
  private nextId = 1_000_000;
  private random: () => number = Math.random;
  private ready = false;

  constructor(random: () => number = Math.random) {
    super();
    this.random = random;
    this.ready = true;
    this.reset();
  }

  /** A new board of the first size (the retry button deals a new scatter of any size). */
  override reset() {
    // The base constructor resets before this class's fields exist.
    if (!this.ready) { super.reset(); return; }
    this.width = ENDLESS_BOARD.width; this.height = ENDLESS_BOARD.height;
    this.core = new PuraSim();
    this.core.level = SANDBOX;
    // Other colours bounce and never mix: nothing to get wrong.
    this.core.fusionPolicy = 'legacy';
    this.core.resize(this.width, this.height);
    this.phase = 'gather'; this.since = 0; this.popped = 0;
    this.core.drops = scatter(this.sorted === 0 ? ENDLESS_COUNTS[0] : this.pickCount(), this.random, this.width, this.height, this.core.pad).map(d => this.drop(d));
    this.recount();
    this.observe();
  }

  override resize(_width: number, _height: number) {
    // A fixed logical board, like the stages.
    this.release(); this.core.resize(this.width, this.height);
  }

  /** Drops still to gather this round (0 once sorted). */
  get remaining() { return this.phase === 'sorted' ? 0 : Math.max(0, this.core.drops.length - new Set(this.core.drops.map(d => dominantHue(d.pigment))).size); }

  override tick(dt: number) {
    super.tick(dt);
    if (!(dt > 0)) return;
    if (this.phase === 'gather') {
      if (!isSorted(this.core.drops)) return;
      this.phase = 'sorted'; this.since = 0; this.popped = 0; this.sorted++;
      const last = this.events.at(-1)?.result;
      if (last) this.lastHue = dominantHue(last.pigment);
      this.order = [...HUES].sort(() => this.random() - 0.5);
      return;
    }
    this.since += Math.min(dt, 1 / 12);
    while (this.popped < 3 && this.since >= POP_AFTER + this.popped * POP_GAP) this.pop(this.order[this.popped++]);
    if (this.popped === 3) this.phase = 'gather';
  }

  /** One sorted drop bursts into the next round's drops of its colour. */
  private pop(hue: HueId) {
    if (!this.next.length) this.next = scatter(this.pickCount(), this.random, this.width, this.height, this.core.pad, this.core.drops);
    const big = this.core.drops.find(d => dominantHue(d.pigment) === hue);
    const children = this.next.filter(d => d.hue === hue).map(d => this.drop(d));
    this.next = this.next.filter(d => d.hue !== hue);
    if (big) {
      if (this.core.grabbedId === big.id) this.release();
      this.core.drops = this.core.drops.filter(d => d !== big);
      // The renderer plays a split as a spray from the parent and the children growing in.
      this.splits.push({ id: big.id, x: big.x, y: big.y, r: big.r, children: children.map(d => ({ ...d, pigment: { ...d.pigment } })) });
    }
    this.core.drops.push(...children);
    this.recount();
  }

  private pickCount() { return ENDLESS_COUNTS[Math.floor(this.random() * ENDLESS_COUNTS.length) % ENDLESS_COUNTS.length]; }

  private drop(d: { x: number; y: number; r: number; hue: HueId }): Drop {
    const pigment = emptyPigment();
    pigment[d.hue] = d.r * d.r;
    return { id: this.nextId++, x: d.x, y: d.y, vx: 0, vy: 0, r: d.r, renderR: d.r, mass: d.r * d.r, pigment, freshness: 0 };
  }

  private recount() {
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of HUES) this.core.quota[hue] += d.pigment[hue];
  }
}
