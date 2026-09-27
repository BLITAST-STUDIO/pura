import type { MichiBoard } from '../michi/boards';

/**
 * はじめて: the first visit's few boards (2026-09-27, RYO: someone handed the
 * game should know what to do from the screen alone; no explanations, no
 * information up front; after a little play, open the modes). Each step shows
 * one verb; its goal is a small picture, never a sentence.
 *
 * 0 さわる: one drop breathing; a tap (which also lets iPhone start sound).
 * 1 ひとつに: two drops; a ghost touch carries one onto the other.
 * 2 あつめる: five drops; the ghost only returns if nothing happens for a while.
 * 3 色ごとに: two colours mixed on the board; other colours bounce.
 * 4 なげる: a line of drops across the top; the ghost flicks.
 */
export type WelcomeStep = {
  id: number;
  /** The goal as a picture: which colours gather, and from how many. */
  picture: { hue: 'cyan' | 'rose' | 'amber'; from: number }[];
  /** How the ghost touch moves: drag one drop onto another, or flick one toward the others. */
  ghost: 'drag' | 'flick' | null;
  /** Seconds of stillness before the ghost appears (0: at once). */
  ghostAfter: number;
  board: MichiBoard;
};

const designed = { perColor: 0, rMin: 0, rMax: 0 } as const;
const board = (id: number, colors: MichiBoard['colors'], layout: MichiBoard['layout']): MichiBoard =>
  ({ id: 900 + id, code: `W${id}`, name: '', hint: '', colors, targetFrac: 1, purity: 0.9, ...designed, layout });

export const WELCOME_STEPS: WelcomeStep[] = [
  { id: 0, picture: [], ghost: null, ghostAfter: 0,
    board: board(0, ['cyan'], [{ x: 210, y: 290, r: 42, hue: 'cyan' }]) },
  { id: 1, picture: [{ hue: 'cyan', from: 2 }], ghost: 'drag', ghostAfter: 0.6,
    board: board(1, ['cyan'], [{ x: 135, y: 300, r: 34, hue: 'cyan' }, { x: 295, y: 250, r: 26, hue: 'cyan' }]) },
  { id: 2, picture: [{ hue: 'cyan', from: 5 }], ghost: 'drag', ghostAfter: 7,
    board: board(2, ['cyan'], [
      { x: 95, y: 140, r: 22, hue: 'cyan' }, { x: 320, y: 130, r: 22, hue: 'cyan' }, { x: 210, y: 290, r: 26, hue: 'cyan' },
      { x: 100, y: 440, r: 22, hue: 'cyan' }, { x: 330, y: 445, r: 22, hue: 'cyan' },
    ]) },
  { id: 3, picture: [{ hue: 'cyan', from: 3 }, { hue: 'rose', from: 3 }], ghost: 'drag', ghostAfter: 8,
    board: board(3, ['cyan', 'rose'], [
      { x: 90, y: 300, r: 26, hue: 'cyan' }, { x: 210, y: 300, r: 24, hue: 'rose' }, { x: 330, y: 300, r: 26, hue: 'cyan' },
      { x: 210, y: 470, r: 24, hue: 'cyan' }, { x: 130, y: 130, r: 24, hue: 'rose' }, { x: 300, y: 130, r: 24, hue: 'rose' },
    ]) },
  { id: 4, picture: [{ hue: 'amber', from: 5 }], ghost: 'flick', ghostAfter: 1,
    board: board(4, ['amber'], [
      { x: 210, y: 480, r: 30, hue: 'amber' },
      { x: 90, y: 120, r: 17, hue: 'amber' }, { x: 170, y: 120, r: 17, hue: 'amber' }, { x: 250, y: 120, r: 17, hue: 'amber' }, { x: 330, y: 120, r: 17, hue: 'amber' },
    ]) },
];

export const WELCOMED_KEY = 'pura-flow-welcome-v1';
export function welcomed(storage: Pick<Storage, 'getItem'> | null) {
  try { return !!storage && storage.getItem(WELCOMED_KEY) !== null; } catch { return true; }
}
