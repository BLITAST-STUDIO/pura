import { dominantHue } from '../../game/palette';
import type { Drop } from '../../game/sim';
import { CurlingSimulation, endScore, HACK, HOUSE, other, type Spin, type Team } from './simulation';

/**
 * The computer's shot: try deliveries in the real simulation (a look-ahead
 * copy per try) and keep the one that leaves the best position, then miss
 * it slightly like a person would. Tries run in small slices so the board
 * keeps animating while it thinks.
 */
export type Shot = { angle: number; power: number; spin: Spin };
export type Strength = 'easy' | 'normal' | 'hard';
export const STRENGTH_LABELS: Record<Strength, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
/**
 * How the computer plays at each strength: how far its hand strays (angle,
 * power), whether it turns its drops and aims to take drops out, and how
 * many of its best ideas it picks from. つよい is the computer approved on
 * 2026-09-27; ふつう strays about twice as much.
 */
export const STRENGTHS: Record<Strength, { angle: number; power: number; spins: Spin[]; takeouts: boolean; pickFrom: number }> = {
  easy: { angle: 4 * Math.PI / 180, power: 0.07, spins: [0], takeouts: false, pickFrom: 6 },
  normal: { angle: 2.2 * Math.PI / 180, power: 0.045, spins: [-1, 0, 1], takeouts: true, pickFrom: 1 },
  hard: { angle: 1.2 * Math.PI / 180, power: 0.025, spins: [-1, 0, 1], takeouts: true, pickFrom: 1 },
};
export const SKILL = STRENGTHS.hard;

/** How good the drops are for `team` if the end stopped now, plus a little for being close. */
export function positionValue(drops: readonly Drop[], team: Team) {
  const score = endScore(drops);
  let value = score.team === team ? score.points * 10 : score.team ? -score.points * 10 : 0;
  const closest = (t: Team) => Math.min(Infinity, ...drops.filter(d => dominantHue(d.pigment) === t)
    .map(d => Math.max(0, Math.hypot(d.x - HOUSE.x, d.y - HOUSE.y) - d.r)).filter(dist => dist <= HOUSE.r));
  const mine = closest(team), theirs = closest(other(team));
  if (mine < Infinity) value += 3 * (1 - mine / HOUSE.r);
  if (theirs < Infinity) value -= 3 * (1 - theirs / HOUSE.r);
  return value;
}

export function candidates(sim: CurlingSimulation, strength: Strength = 'hard'): Shot[] {
  const { spins, takeouts } = STRENGTHS[strength];
  const out: Shot[] = [];
  for (const spin of spins) for (let deg = 258; deg <= 282; deg += 1.5) for (let power = 0.38; power <= 1.001; power += 0.04) out.push({ angle: deg * Math.PI / 180, power: +power.toFixed(2), spin });
  // Straight at each rival drop, hard: the takeouts.
  if (takeouts) for (const d of sim.core.drops) if (dominantHue(d.pigment) !== sim.turn && d.id !== sim.delivery) {
    const angle = Math.atan2(d.y - HACK.y, d.x - HACK.x);
    for (const power of [0.8, 0.9, 1]) out.push({ angle, power, spin: 0 });
  }
  return out;
}

export function tryShot(sim: CurlingSimulation, shot: Shot) {
  const copy = sim.lookahead();
  copy.shoot(shot.angle, shot.power, shot.spin);
  copy.settle();
  return positionValue(copy.core.drops, sim.turn);
}

export class Planner {
  private list: Shot[];
  private index = 0;
  best: Shot | null = null;
  private bestValue = -Infinity;
  /** The best few, for the gentler strengths that do not always pick the very best. */
  private top: { shot: Shot; value: number }[] = [];
  constructor(private readonly sim: CurlingSimulation, private readonly random = Math.random, private readonly strength: Strength = 'hard') { this.list = candidates(sim, strength); }
  get done() { return this.index >= this.list.length; }
  /** Try up to `n` more deliveries; true when finished. */
  step(n: number) {
    for (let k = 0; k < n && !this.done; k++) {
      const shot = this.list[this.index++];
      const value = tryShot(this.sim, shot) + this.random() * 1e-3;
      if (value > this.bestValue) { this.bestValue = value; this.best = shot; }
      this.top.push({ shot, value }); this.top.sort((a, b) => b.value - a.value); this.top.length = Math.min(this.top.length, 8);
    }
    return this.done;
  }
  /** The chosen shot with a person's small error. */
  shot(): Shot {
    const skill = STRENGTHS[this.strength];
    const pool = this.top.slice(0, skill.pickFrom);
    const b = pool.length ? pool[Math.floor(this.random() * pool.length)].shot : this.best ?? { angle: -Math.PI / 2, power: 0.6, spin: 0 };
    const gauss = () => (this.random() + this.random() + this.random() - 1.5) / 0.5;
    return { angle: b.angle + gauss() * skill.angle, power: Math.min(1, Math.max(0.3, b.power + gauss() * skill.power)), spin: b.spin };
  }
}
