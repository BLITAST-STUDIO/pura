import type { ShotBoard } from './simulation';

/**
 * The trial boards. `par` is the fewest shots found by
 * scripts/hitofude-solve.ts in the real simulation (see HITOFUDE.md).
 */
export const SHOT_BOARDS: ShotBoard[] = [
  {
    id: 1, code: '01', name: 'ひとすじ', hint: '引いて、離す。一度で、ぜんぶ。', shots: 3, par: 1,
    drops: [
      { x: 130, y: 470, r: 26, hue: 'cyan' },
      { x: 173, y: 385, r: 20, hue: 'cyan' },
      { x: 209, y: 314, r: 20, hue: 'cyan' },
      { x: 245, y: 242, r: 20, hue: 'cyan' },
      { x: 281, y: 171, r: 20, hue: 'cyan' },
    ],
  },
  {
    // Laid along the path a single shot really takes, including the bank.
    id: 2, code: '02', name: 'はねかえり', hint: '壁も、道のうち。', shots: 4, par: 1,
    drops: [
      { x: 80, y: 480, r: 24, hue: 'cyan' },
      { x: 189, y: 404, r: 17, hue: 'cyan' },
      { x: 277, y: 342, r: 17, hue: 'cyan' },
      { x: 357, y: 267, r: 17, hue: 'cyan' },
      { x: 310, y: 186, r: 17, hue: 'cyan' },
    ],
  },
  {
    // Two diagonals cross; a rose drop sits on the crossing.
    id: 3, code: '03', name: 'ふたいろ', hint: '違う色は、はじく。順番と強さ。', shots: 5, par: 2,
    drops: [
      { x: 100, y: 470, r: 24, hue: 'cyan' },
      { x: 150, y: 388, r: 18, hue: 'cyan' },
      { x: 255, y: 216, r: 18, hue: 'cyan' },
      { x: 300, y: 143, r: 18, hue: 'cyan' },
      { x: 320, y: 470, r: 24, hue: 'rose' },
      { x: 270, y: 388, r: 18, hue: 'rose' },
      { x: 210, y: 290, r: 20, hue: 'rose' },
      { x: 150, y: 190, r: 18, hue: 'rose' },
    ],
  },
];
