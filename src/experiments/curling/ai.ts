import { dominantHue } from '../../game/palette';
import type { Drop } from '../../game/sim';
import { CurlingSimulation, endScore, HACK, HOUSE, other, type Team } from './simulation';

/**
 * The computer's shot: try deliveries in the real simulation (a look-ahead
 * copy per try) and keep the one that leaves the best position, then miss
 * it slightly like a person would. Tries run in small slices so the board
 * keeps animating while it thinks.
 */
export type Shot = { angle: number; power: number };
export const SKILL = { angle: 1.2 * Math.PI / 180, power: 0.025 };

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

export function candidates(sim: CurlingSimulation): Shot[] {
  const out: Shot[] = [];
  for (let deg = 258; deg <= 282; deg += 1.5) for (let power = 0.38; power <= 1.001; power += 0.04) out.push({ angle: deg * Math.PI / 180, power: +power.toFixed(2) });
  // Straight at each rival drop, hard: the takeouts.
  for (const d of sim.core.drops) if (dominantHue(d.pigment) !== sim.turn && d.id !== sim.delivery) {
    const angle = Math.atan2(d.y - HACK.y, d.x - HACK.x);
    for (const power of [0.8, 0.9, 1]) out.push({ angle, power });
  }
  return out;
}

export function tryShot(sim: CurlingSimulation, shot: Shot) {
  const copy = sim.lookahead();
  copy.shoot(shot.angle, shot.power);
  copy.settle();
  return positionValue(copy.core.drops, sim.turn);
}

export class Planner {
  private list: Shot[];
  private index = 0;
  best: Shot | null = null;
  private bestValue = -Infinity;
  constructor(private readonly sim: CurlingSimulation, private readonly random = Math.random) { this.list = candidates(sim); }
  get done() { return this.index >= this.list.length; }
  /** Try up to `n` more deliveries; true when finished. */
  step(n: number) {
    for (let k = 0; k < n && !this.done; k++) {
      const shot = this.list[this.index++];
      const value = tryShot(this.sim, shot) + this.random() * 1e-3;
      if (value > this.bestValue) { this.bestValue = value; this.best = shot; }
    }
    return this.done;
  }
  /** The chosen shot with a person's small error. */
  shot(): Shot {
    const b = this.best ?? { angle: -Math.PI / 2, power: 0.6 };
    const gauss = () => (this.random() + this.random() + this.random() - 1.5) / 0.5;
    return { angle: b.angle + gauss() * SKILL.angle, power: Math.min(1, Math.max(0.3, b.power + gauss() * SKILL.power)) };
  }
}
