import { shotLimit, type ShotResult } from './simulation';

/**
 * Mini-golf scoring for ひとふで. A hole's strokes are the shots taken; a
 * hole not finished within its limit is picked up and counts one more than
 * the limit. A round is the nine holes in order, each counted once.
 */
export function holeStrokes(result: ShotResult, par: number) {
  return result.cleared ? result.shots : shotLimit(par) + 1;
}

/** −1 / ±0 / +2, with a real minus sign. */
export function relative(diff: number) {
  return diff === 0 ? '±0' : diff > 0 ? `+${diff}` : `−${-diff}`;
}

const NAMES: Record<number, string> = { [-3]: 'アルバトロス', [-2]: 'イーグル', [-1]: 'バーディー', 0: 'パー', 1: 'ボギー', 2: 'ダブルボギー', 3: 'トリプルボギー' };

/** One shot is the mode's namesake — its hole-in-one. */
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'ひとふで';
  return NAMES[strokes - par] ?? relative(strokes - par);
}

export type Card = (number | null)[];

export function totals(card: Card, pars: number[]) {
  let strokes = 0, par = 0, holes = 0;
  card.forEach((s, i) => { if (s !== null) { strokes += s; par += pars[i]; holes++; } });
  return { strokes, par, diff: strokes - par, holes };
}

/** The nine holes played in order; each hole's first finish is what counts. */
export class Round {
  readonly card: Card;
  constructor(readonly pars: number[]) { this.card = pars.map(() => null); }
  get hole() { const i = this.card.indexOf(null); return i < 0 ? this.pars.length : i; }
  get finished() { return this.hole >= this.pars.length; }
  record(strokes: number) { if (!this.finished) this.card[this.hole] = strokes; }
  get totals() { return totals(this.card, this.pars); }
}
