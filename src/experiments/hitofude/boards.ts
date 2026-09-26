import type { ShotBoard } from './simulation';

/**
 * The course. `min` is the fewest shots found by scripts/hitofude-solve.ts in
 * the real simulation; `par` is one more, so a hole finished in its minimum
 * is under par, as a hole-in-one is in mini golf (see HITOFUDE.md).
 */
export const SHOT_BOARDS: ShotBoard[] = [
  {
    id: 1, code: '01', name: 'ひとすじ', hint: '引いて、離す。一度で、ぜんぶ。', par: 2, min: 1,
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
    id: 2, code: '02', name: 'はねかえり', hint: '壁も、道のうち。', par: 2, min: 1,
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
    id: 3, code: '03', name: 'ふたいろ', hint: '違う色は、はじく。順番と強さ。', par: 3, min: 2,
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
  {
    // Everything waits behind the stone, where no straight shot reaches;
    // one full-power bank off the side wall does (an 8° window).
    id: 4, code: '04', name: 'いし', hint: '石のむこうへ。', par: 2, min: 1,
    stones: [{ x: 210, y: 330, r: 38 }],
    drops: [
      { x: 210, y: 495, r: 24, hue: 'cyan' },
      { x: 140, y: 175, r: 18, hue: 'cyan' },
      { x: 210, y: 120, r: 18, hue: 'cyan' },
      { x: 280, y: 175, r: 18, hue: 'cyan' },
    ],
  },
  {
    // A cut shot: the rose goes on to the rose, the cyan glances off to the cyan.
    id: 5, code: '05', name: 'たまつき', hint: '当てて、押し出す。', par: 2, min: 1,
    drops: [
      { x: 200, y: 490, r: 24, hue: 'cyan' },
      { x: 225, y: 350, r: 24, hue: 'rose' },
      { x: 318, y: 214, r: 20, hue: 'rose' },
      { x: 110, y: 238, r: 20, hue: 'cyan' },
    ],
  },
  {
    // The gate lets a small drop through, not a merged one.
    id: 6, code: '06', name: 'せまいみち', hint: '大きくなると、通れない。', par: 3, min: 2,
    stones: [{ x: 150, y: 320, r: 34 }, { x: 270, y: 320, r: 34 }],
    drops: [
      { x: 210, y: 480, r: 20, hue: 'cyan' },
      { x: 95, y: 430, r: 22, hue: 'cyan' },
      { x: 210, y: 200, r: 20, hue: 'cyan' },
      { x: 310, y: 120, r: 18, hue: 'cyan' },
    ],
  },
  {
    // Three pairs across the centre; the amber diagonal holds the centre.
    // In order it takes three; a combination shot found by the search takes two.
    id: 7, code: '07', name: 'みつどもえ', hint: '三つの線が、真ん中で交わる。', par: 3, min: 2,
    drops: [
      { x: 210, y: 470, r: 22, hue: 'cyan' },
      { x: 210, y: 120, r: 20, hue: 'cyan' },
      { x: 90, y: 390, r: 22, hue: 'rose' },
      { x: 330, y: 200, r: 20, hue: 'rose' },
      { x: 90, y: 200, r: 22, hue: 'amber' },
      { x: 210, y: 295, r: 18, hue: 'amber' },
      { x: 330, y: 390, r: 20, hue: 'amber' },
    ],
  },
  {
    // One amber shot off the left wall; the rose pair waits on the right.
    id: 8, code: '08', name: 'かべあて', hint: '長い一打。壁を二度。', par: 3, min: 2,
    drops: [
      { x: 350, y: 495, r: 24, hue: 'amber' },
      { x: 234, y: 404, r: 16, hue: 'amber' },
      { x: 140, y: 331, r: 16, hue: 'amber' },
      { x: 81, y: 211, r: 16, hue: 'amber' },
      { x: 128, y: 114, r: 16, hue: 'amber' },
      { x: 320, y: 300, r: 20, hue: 'rose' },
      { x: 320, y: 170, r: 20, hue: 'rose' },
    ],
  },
  {
    // The finale: the cyan kisses the rose into the stone; both colours run on up the board.
    id: 9, code: '09', name: 'ひとふで', hint: '一度で、ぜんぶ。できるなら。', par: 3, min: 1,
    stones: [{ x: 290, y: 250, r: 30 }],
    drops: [
      { x: 90, y: 500, r: 26, hue: 'cyan' },
      { x: 150, y: 370, r: 22, hue: 'rose' },
      { x: 195, y: 184, r: 20, hue: 'rose' },
      { x: 109, y: 205, r: 20, hue: 'cyan' },
      { x: 160, y: 104, r: 17, hue: 'rose' },
      { x: 84, y: 96, r: 17, hue: 'cyan' },
    ],
  },
];
