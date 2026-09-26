import { LEGACY_TUNING, PuraSim, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { dominantHue, emptyPigment } from '../../game/palette';
import { FusionSimulation } from '../fusion-lab/simulation';
import { launch, MAX_PULL, MIN_PULL } from '../hitofude/simulation';

/**
 * Curling with drops (the original concept: a flicked drop slides "like a
 * curling stone"). The rules are curling's, cut to one short sheet:
 * - Ends: each side delivers STONES_PER_END drops alternately; the side
 *   without the hammer (last stone) goes first.
 * - A delivered drop must pass the hog line or it is removed; a drop that
 *   touches the side or back boards is out of play.
 * - After the last drop, the side with the drop closest to the button scores
 *   one point for each of its drops closer than the other side's closest.
 *   Only drops touching the house count. A blank end scores nothing.
 * - The side that scores gives the hammer to the other; a blank end keeps it.
 * - ENDS ends, then one extra end on a tie.
 * PURA's twist: drops of one colour that touch fuse, so two stones become one
 * larger stone — it reaches the button more easily and is harder to move,
 * but it counts once. Other colours bounce, which is what takes a drop out.
 * Drops do not curl (no spin).
 */
export const SHEET = { width: 420, height: 560 };
export const HOUSE = { x: 210, y: 150, r: 110, rings: [110, 72, 36, 12] };
export const HACK = { x: 210, y: 500 };
export const HOG_Y = 330;
export const STONE_R = 18;
export const STONES_PER_END = 4;
export const ENDS = 4;
/** Launch speed at full pull. A draw to the button is about 0.6; the house spans about 0.46–0.71. */
export const CURLING_SPEED = 560;
/** Sliding friction makes a drop glide, then stop within about three seconds. */
export const CURLING_TUNING = { ...LEGACY_TUNING, grabK: 0, grabDamp: 0, attraction: 0, friction: 60 };
const REST_SPEED = 2;

export type Team = 'cyan' | 'rose';
export const other = (team: Team): Team => team === 'cyan' ? 'rose' : 'cyan';
export type Phase = 'aim' | 'moving' | 'scored' | 'over';
export type EndResult = { team: Team | null; points: number };

/** Curling's count: the side closest to the button scores each drop closer than the other side's closest. */
export function endScore(drops: readonly Pick<Drop, 'x' | 'y' | 'r' | 'pigment'>[]): EndResult {
  const inHouse = drops
    .map(d => ({ team: dominantHue(d.pigment) as Team, distance: Math.max(0, Math.hypot(d.x - HOUSE.x, d.y - HOUSE.y) - d.r) }))
    .filter(s => s.distance <= HOUSE.r && (s.team === 'cyan' || s.team === 'rose'))
    .sort((a, b) => a.distance - b.distance);
  if (!inHouse.length) return { team: null, points: 0 };
  const team = inHouse[0].team;
  const rival = inHouse.find(s => s.team !== team);
  return { team, points: inHouse.filter(s => s.team === team && (!rival || s.distance < rival.distance)).length };
}

function stone(id: number, team: Team): Drop {
  const pigment = emptyPigment(); pigment[team] = STONE_R * STONE_R;
  return { id, x: HACK.x, y: HACK.y, vx: 0, vy: 0, r: STONE_R, renderR: STONE_R, mass: STONE_R * STONE_R, pigment, freshness: 0 };
}

export class CurlingSimulation extends FusionSimulation {
  end = 1;
  hammer: Team = 'rose';
  turn: Team = 'cyan';
  phase: Phase = 'aim';
  thrown: Record<Team, number> = { cyan: 0, rose: 0 };
  /** Points per end, in order; null while an end is not scored yet. */
  ends: EndResult[] = [];
  lastEnd: EndResult | null = null;
  /** The drop waiting at the hack, or the one just delivered. */
  delivery: number | null = null;
  /** What happened to the last delivery, for a brief note. */
  note: 'hog' | 'out' | null = null;
  private aiming = false;
  /** Sides played by a person; the others do not answer to touch. */
  control: Team[] = ['cyan', 'rose'];
  /** A shot shown on the floor before the computer delivers it. */
  preview: { angle: number; power: number } | null = null;
  private out = new Set<number>();
  private nextId = 5000;
  /** A search copy resolves one delivery and stops (no turn change, no scoring). */
  private searching = false;

  constructor() { super(); this.newGame(); }

  // The base constructor calls reset before this class's fields exist; the constructor starts the game.
  override reset() { if (this.out) this.newGame(); }

  newGame() {
    this.end = 1; this.hammer = 'rose'; this.ends = []; this.lastEnd = null;
    this.startEnd();
  }

  private startEnd() {
    this.width = SHEET.width; this.height = SHEET.height;
    this.thrown = { cyan: 0, rose: 0 }; this.note = null; this.lastEnd = null;
    this.core = new PuraSim();
    this.core.level = SANDBOX;
    this.core.fusionPolicy = 'legacy';
    this.core.tuning = { ...CURLING_TUNING };
    this.core.resize(this.width, this.height);
    this.core.drops = [];
    this.observe();
    this.turn = other(this.hammer);
    this.place();
  }

  protected override observe() {
    super.observe();
    const report = this.core.onContact;
    this.core.onContact = (id, x, y, kind) => { report?.(id, x, y, kind); if (kind === 'wall') this.out.add(id); };
  }

  override resize(_width: number, _height: number) { this.abort(); this.core.resize(this.width, this.height); }

  private place() {
    const d = stone(this.nextId++, this.turn);
    this.core.drops.push(d);
    this.delivery = d.id; this.phase = 'aim'; this.out.clear();
  }

  get totals(): Record<Team, number> {
    const t = { cyan: 0, rose: 0 };
    for (const e of this.ends) if (e.team) t[e.team] += e.points;
    return t;
  }
  get stonesLeft(): Record<Team, number> { return { cyan: STONES_PER_END - this.thrown.cyan, rose: STONES_PER_END - this.thrown.rose }; }
  get atRest() { return this.core.drops.every(d => Math.hypot(d.vx, d.vy) < REST_SPEED); }
  /** The end as it would score if it ended now. */
  get standing() { return endScore(this.core.drops.filter(d => d.id !== this.delivery || this.phase !== 'aim')); }

  override grab(id: number) {
    if (this.phase !== 'aim' || id !== this.delivery || !this.control.includes(this.turn)) return false;
    this.aiming = true;
    this.core.grabbedId = id; this.core.pointer = { x: HACK.x, y: HACK.y };
    return true;
  }

  get aim() {
    if (this.preview && this.phase === 'aim') return { x: HACK.x, y: HACK.y, r: STONE_R, dx: Math.cos(this.preview.angle), dy: Math.sin(this.preview.angle), power: this.preview.power };
    const p = this.core.pointer;
    if (!this.aiming || !p) return null;
    const shot = launch(p.x - HACK.x, p.y - HACK.y, CURLING_SPEED);
    if (!shot) return { x: HACK.x, y: HACK.y, r: STONE_R, dx: 0, dy: 0, power: 0 };
    const speed = Math.hypot(shot.vx, shot.vy);
    return { x: HACK.x, y: HACK.y, r: STONE_R, dx: shot.vx / speed, dy: shot.vy / speed, power: shot.power };
  }

  override release() {
    const p = this.core.pointer;
    const shot = this.aiming && p ? launch(p.x - HACK.x, p.y - HACK.y, CURLING_SPEED) : null;
    this.aiming = false; this.core.pointerUp();
    if (shot) this.deliver(shot.vx, shot.vy);
  }

  override abort() { this.aiming = false; this.core.pointerUp(); }

  /** Deliver at an angle (radians, board axes) and power 0..1 — the computer's and the tests' hand. */
  shoot(angle: number, power: number) {
    if (this.phase !== 'aim') return false;
    const speed = CURLING_SPEED * Math.min(1, Math.max(0, power));
    if (speed < CURLING_SPEED * MIN_PULL / MAX_PULL) return false;
    this.deliver(Math.cos(angle) * speed, Math.sin(angle) * speed);
    return true;
  }

  private deliver(vx: number, vy: number) {
    this.preview = null;
    const d = this.core.drops.find(d => d.id === this.delivery);
    if (!d) return;
    d.vx = vx; d.vy = vy;
    this.thrown[this.turn]++;
    this.phase = 'moving'; this.note = null;
  }

  override tick(dt: number) {
    super.tick(dt);
    if (this.aiming) { const d = this.core.drops.find(d => d.id === this.delivery); if (d) { d.x = HACK.x; d.y = HACK.y; d.vx = 0; d.vy = 0; } }
    if (this.out.size) {
      if (this.delivery !== null && this.out.has(this.delivery)) this.note = 'out';
      this.core.drops = this.core.drops.filter(d => !this.out.has(d.id));
      this.out.clear();
    }
    if (this.phase !== 'moving' || !this.atRest) return;
    // Hog line: the delivered drop, if still itself, must have crossed it.
    const delivered = this.core.drops.find(d => d.id === this.delivery);
    if (delivered && delivered.y > HOG_Y) { this.core.drops = this.core.drops.filter(d => d !== delivered); this.note = 'hog'; }
    for (const d of this.core.drops) { d.vx = 0; d.vy = 0; }
    if (this.searching) { this.phase = 'scored'; return; }
    if (this.thrown.cyan + this.thrown.rose >= STONES_PER_END * 2) {
      this.lastEnd = endScore(this.core.drops);
      this.ends.push(this.lastEnd);
      this.phase = 'scored';
      return;
    }
    this.turn = other(this.turn);
    this.place();
  }

  /** After a scored end: hand over the hammer and start the next end, or finish. */
  nextEnd() {
    if (this.phase !== 'scored' || !this.lastEnd) return;
    if (this.lastEnd.team) this.hammer = other(this.lastEnd.team);
    const t = this.totals;
    const done = this.ends.length >= ENDS && (t.cyan !== t.rose || this.ends.length >= ENDS + 1);
    if (done) { this.phase = 'over'; return; }
    this.end++;
    this.startEnd();
  }

  get winner(): Team | 'draw' | null {
    if (this.phase !== 'over') return null;
    const t = this.totals;
    return t.cyan === t.rose ? 'draw' : t.cyan > t.rose ? 'cyan' : 'rose';
  }

  /** A copy of the current position with the drop at the hack, for looking ahead. */
  lookahead(): CurlingSimulation {
    const copy = new CurlingSimulation();
    copy.searching = true;
    copy.turn = this.turn; copy.hammer = this.hammer; copy.end = this.end;
    copy.thrown = { ...this.thrown };
    copy.core.drops = this.core.drops.map(d => ({ ...d, pigment: { ...d.pigment } }));
    copy.delivery = this.delivery; copy.phase = 'aim';
    return copy;
  }

  /** Resolve a delivery to rest (search copies and tests). */
  settle(maxSeconds = 12) {
    for (let t = 0; t < maxSeconds && this.phase === 'moving'; t += 1 / 60) this.tick(1 / 60);
  }
}
