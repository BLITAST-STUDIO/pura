import { LEGACY_TUNING, PuraSim } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { dominantHue, type HueId } from '../../game/palette';
import { FusionSimulation } from '../fusion-lab/simulation';
import { boardDrops, type BoardDrop } from '../boards';

/**
 * ひとふで (one stroke): the original concept's core — a flicked drop slides
 * like a curling stone and swallows the same colour on its way. Each board
 * is a hole with a par, scored against it as in mini golf (golf.ts).
 *
 * A shot is aimed by pulling back from the drop and letting go: the drop
 * leaves in the opposite direction, faster the farther it was pulled. While
 * aiming it stays where it is, so a shot is precise and repeatable. After
 * that the inherited physics runs unchanged (damping, walls, bounces, same
 * colours fusing on contact, other colours bouncing). Two settings differ
 * from the other modes, both so a shot goes where it was aimed: no spring
 * toward the finger (the drop is held still while aiming) and no pull
 * between drops.
 */
export const SHOT_BOARD = { width: 420, height: 560 };
/** Pull, in board units, that gives a full-power shot. */
export const MAX_PULL = 130;
/** A shorter pull is cancelled rather than counted. */
export const MIN_PULL = 14;
/** Launch speed at full power, board units per second (the simulation caps at 760). */
export const SHOT_SPEED = 720;
/** A drop still sliding faster than this cannot be picked up. */
export const AIMABLE_SPEED = 30;
const REST_SPEED = 4;

export type Stone = { x: number; y: number; r: number };
/**
 * A hole. `par` is the expected good score; `min` is the fewest shots the
 * search found (a hole may have a hard one-shot below its par).
 */
export type ShotBoard = { id: number; code: string; name: string; hint: string; par: number; min: number; drops: BoardDrop[]; stones?: Stone[] };
/** Strokes allowed on a hole, as in mini golf's pick-up rule. */
export const shotLimit = (par: number) => par + 3;
export type Aim = { id: number; x: number; y: number; r: number; dx: number; dy: number; power: number };
export type ShotResult = { cleared: boolean; shots: number };

/** Launch velocity for a pull from the drop's centre to the finger. */
export function launch(pullX: number, pullY: number): { vx: number; vy: number; power: number } | null {
  const length = Math.hypot(pullX, pullY);
  if (!(length >= MIN_PULL)) return null;
  const power = Math.min(1, length / MAX_PULL);
  return { vx: -pullX / length * SHOT_SPEED * power, vy: -pullY / length * SHOT_SPEED * power, power };
}

export class HitofudeSimulation extends FusionSimulation {
  board: ShotBoard | undefined;
  shots = 0;
  result: ShotResult | null = null;
  private aiming: { id: number; x: number; y: number } | null = null;

  constructor(board: ShotBoard) {
    super();
    this.board = board;
    this.reset();
  }

  override reset() {
    // The base constructor resets before this class's board exists.
    if (!this.board) { super.reset(); return; }
    this.width = SHOT_BOARD.width; this.height = SHOT_BOARD.height;
    this.shots = 0; this.result = null; this.aiming = null;
    this.core = new PuraSim();
    // The sandbox level keeps the legacy core-and-quota win check out of the way.
    this.core.level = SANDBOX;
    this.core.fusionPolicy = 'legacy';
    this.core.tuning = { ...LEGACY_TUNING, grabK: 0, grabDamp: 0, attraction: 0 };
    this.core.resize(this.width, this.height);
    this.core.drops = boardDrops(this.board.drops);
    this.core.obstacles = this.board.stones ?? [];
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const hue of ['cyan', 'rose', 'amber'] as const) this.core.quota[hue] += d.pigment[hue];
    this.observe();
  }

  override resize(_width: number, _height: number) {
    this.abort(); this.core.resize(this.width, this.height);
  }

  get shotsLeft() { return Math.max(0, shotLimit(this.board?.par ?? 0) - this.shots); }

  /** Colours on the board and how many separate drops each still has. */
  groups(): Map<HueId, number> {
    const groups = new Map<HueId, number>();
    for (const d of this.core.drops) { const hue = dominantHue(d.pigment); groups.set(hue, (groups.get(hue) ?? 0) + 1); }
    return groups;
  }

  /** Fusions still needed: every colour must end as a single drop. */
  get remaining() { let n = 0; for (const count of this.groups().values()) n += count - 1; return n; }

  get atRest() { return this.core.drops.every(d => Math.hypot(d.vx, d.vy) < REST_SPEED); }

  override grab(id: number) {
    if (this.result || this.shotsLeft === 0) return false;
    const d = this.core.drops.find(d => d.id === id);
    if (!d || Math.hypot(d.vx, d.vy) > AIMABLE_SPEED) return false;
    d.vx = 0; d.vy = 0;
    this.aiming = { id, x: d.x, y: d.y };
    this.core.grabbedId = id; this.core.pointer = { x: d.x, y: d.y };
    return true;
  }

  get aim(): Aim | null {
    const a = this.aiming, p = this.core.pointer;
    if (!a || !p) return null;
    const d = this.core.drops.find(d => d.id === a.id);
    if (!d) return null;
    const shot = launch(p.x - a.x, p.y - a.y);
    if (!shot) return { id: d.id, x: d.x, y: d.y, r: d.r, dx: 0, dy: 0, power: 0 };
    const speed = Math.hypot(shot.vx, shot.vy);
    return { id: d.id, x: d.x, y: d.y, r: d.r, dx: shot.vx / speed, dy: shot.vy / speed, power: shot.power };
  }

  /** Letting go shoots (or cancels a pull shorter than MIN_PULL). */
  override release() {
    const a = this.aiming, p = this.core.pointer;
    const d = a && this.core.drops.find(d => d.id === a.id);
    const shot = a && p ? launch(p.x - a.x, p.y - a.y) : null;
    if (d && shot) { d.vx = shot.vx; d.vy = shot.vy; this.shots++; }
    this.aiming = null;
    this.core.pointerUp();
  }

  /** Interruptions (blur, resize, pause) put the drop down without shooting. */
  override abort() {
    this.aiming = null;
    this.core.pointerUp();
  }

  override tick(dt: number) {
    super.tick(dt);
    const a = this.aiming;
    if (a) {
      // A drop fused while aimed hands the aim to the fused drop, where it now sits.
      if (this.core.grabbedId !== null && this.core.grabbedId !== a.id) {
        const fused = this.core.drops.find(d => d.id === this.core.grabbedId);
        if (fused) { a.id = fused.id; a.x = fused.x; a.y = fused.y; }
      }
      const d = this.core.drops.find(d => d.id === a.id);
      if (d) { d.x = a.x; d.y = a.y; d.vx = 0; d.vy = 0; } else this.abort();
    }
    if (this.result || !this.board) return;
    if (this.remaining === 0) this.result = { cleared: true, shots: this.shots };
    else if (this.shotsLeft === 0 && !this.aiming && this.atRest) this.result = { cleared: false, shots: this.shots };
  }
}
