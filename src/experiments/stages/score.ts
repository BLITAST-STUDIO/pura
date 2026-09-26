/**
 * Score attack: a dilemma between care and speed, scored on top of the legacy
 * stage rules without touching physics.
 * - Clear: base points, plus purity above the stage's requirement.
 * - Speed: a bonus that decays with time. There is no forced time-out (G-09).
 * - Combo: pure same-colour fusions within COMBO_WINDOW of each other chain;
 *   each fusion in a chain adds more. A mixed fusion breaks the chain.
 * - Spit (the double-tap separation): costs points every use, more for a
 *   larger amount released, so a small slip may be worth keeping.
 */
export const COMBO_WINDOW = 1.2;
const COMBO_STEP = 20;
const COMBO_CAP = 200;
const CLEAR_BASE = 1000;
const PURITY_POINTS = 1000;
const SPEED_POINTS = 1500;
const SPIT_BASE = 60;
const SPIT_PER_BOARD = 600;

export type ScoreBreakdown = { clear: number; purity: number; speed: number; combo: number; spit: number; total: number };

/** Seconds at which the speed bonus has fallen to about 37%; grows with the stage size. */
export function parSeconds(drops: number) { return 10 + drops * 1.4; }

export class ScoreAttack {
  private comboPoints = 0;
  private spitPoints = 0;
  private chain = 0;
  private lastFusion = -Infinity;
  private bestChain = 0;
  spits = 0;
  result: ScoreBreakdown | null = null;

  constructor(private readonly totalMass: number, private readonly drops: number, private readonly requiredPurity: number) {}

  /** `time` is simulation seconds; `pure` means the merged drop stayed one colour. */
  fusion(time: number, pure: boolean): number {
    if (this.result) return 0;
    if (!pure) { this.chain = 0; this.lastFusion = -Infinity; return 0; }
    this.chain = time - this.lastFusion <= COMBO_WINDOW ? this.chain + 1 : 1;
    this.lastFusion = time;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const gain = this.chain > 1 ? Math.min(COMBO_CAP, COMBO_STEP * (this.chain - 1)) : 0;
    this.comboPoints += gain;
    return gain;
  }

  /** Returns the points lost for releasing `mass` of other colours. */
  spit(mass: number): number {
    if (this.result) return 0;
    const share = this.totalMass > 0 ? Math.max(0, mass) / this.totalMass : 0;
    const cost = Math.round(SPIT_BASE + SPIT_PER_BOARD * share);
    this.spits++;
    this.spitPoints += cost;
    this.chain = 0; this.lastFusion = -Infinity;
    return cost;
  }

  /** The chain shown on screen: still alive only inside the window. */
  combo(time: number): number { return time - this.lastFusion <= COMBO_WINDOW ? this.chain : 0; }
  get longestChain() { return this.bestChain; }

  /** Running score before the clear (combos minus spits, never below zero). */
  get running() { return Math.max(0, this.comboPoints - this.spitPoints); }

  finish(seconds: number, averagePurity: number): ScoreBreakdown {
    if (this.result) return this.result;
    const headroom = Math.max(1e-6, 1 - this.requiredPurity);
    const purity = Math.round(PURITY_POINTS * Math.min(1, Math.max(0, (averagePurity - this.requiredPurity) / headroom)));
    const speed = Math.round(SPEED_POINTS * Math.exp(-Math.max(0, seconds) / parSeconds(this.drops)));
    const combo = this.comboPoints, spit = this.spitPoints;
    this.result = { clear: CLEAR_BASE, purity, speed, combo, spit: -spit, total: Math.max(0, CLEAR_BASE + purity + speed + combo - spit) };
    return this.result;
  }
}
