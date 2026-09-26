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
  {
    // Laid along the real path; each fusion shifts the drop toward what it swallowed, so the path sways.
    id: 10, code: '10', name: 'うねり', hint: 'ゆれる列を、一度に。', par: 2, min: 1,
    drops: [
      { x: 90, y: 505, r: 22, hue: 'cyan' },
      { x: 140, y: 419, r: 15, hue: 'cyan' },
      { x: 144, y: 346, r: 15, hue: 'cyan' },
      { x: 194, y: 289, r: 15, hue: 'cyan' },
      { x: 194, y: 221, r: 15, hue: 'cyan' },
      { x: 240, y: 176, r: 15, hue: 'cyan' },
      { x: 238, y: 112, r: 15, hue: 'cyan' },
    ],
  },
  {
    // A heavy rose blocks the straight way; small drops barely move it.
    id: 11, code: '11', name: 'おもし', hint: '重い雫は、動かない。', par: 3, min: 2,
    drops: [
      { x: 210, y: 505, r: 22, hue: 'cyan' },
      { x: 160, y: 150, r: 16, hue: 'cyan' },
      { x: 260, y: 150, r: 16, hue: 'cyan' },
      { x: 210, y: 300, r: 42, hue: 'rose' },
      { x: 350, y: 440, r: 16, hue: 'rose' },
    ],
  },
  {
    // Colours alternate along one diagonal.
    id: 12, code: '12', name: 'まじりの列', hint: '一列に、二つの色。', par: 3, min: 1,
    drops: [
      { x: 90, y: 470, r: 20, hue: 'cyan' },
      { x: 138, y: 398, r: 16, hue: 'rose' },
      { x: 186, y: 326, r: 16, hue: 'cyan' },
      { x: 234, y: 254, r: 16, hue: 'rose' },
      { x: 282, y: 182, r: 16, hue: 'cyan' },
      { x: 330, y: 110, r: 16, hue: 'rose' },
    ],
  },
  {
    // A heavy cyan cuts the rose to its partner, then the amber to its own, and runs on to the cyan.
    id: 13, code: '13', name: 'たまつき二つ', hint: '重い一打で、二つ突く。', par: 3, min: 1,
    drops: [
      { x: 210, y: 505, r: 30, hue: 'cyan' },
      { x: 198, y: 400, r: 15, hue: 'rose' },
      { x: 150, y: 236, r: 15, hue: 'rose' },
      { x: 241, y: 262, r: 15, hue: 'amber' },
      { x: 298, y: 127, r: 15, hue: 'amber' },
      { x: 223, y: 160, r: 16, hue: 'cyan' },
    ],
  },
  {
    // Two gates in a row; each lets a small drop through.
    id: 14, code: '14', name: 'せまいみち・二', hint: '門が、ふたつ。', par: 2, min: 1,
    stones: [{ x: 130, y: 380, r: 28 }, { x: 250, y: 380, r: 28 }, { x: 170, y: 220, r: 28 }, { x: 290, y: 220, r: 28 }],
    drops: [
      { x: 190, y: 500, r: 20, hue: 'cyan' },
      { x: 230, y: 300, r: 14, hue: 'cyan' },
      { x: 230, y: 130, r: 14, hue: 'cyan' },
    ],
  },
  {
    // A shallow hit on the left wall leaves along it; the drops wait on that line.
    id: 15, code: '15', name: 'かべぞい', hint: '浅く当てると、壁に沿う。', par: 2, min: 1,
    drops: [
      { x: 150, y: 505, r: 20, hue: 'amber' },
      { x: 47, y: 218, r: 13, hue: 'amber' },
      { x: 58, y: 163, r: 13, hue: 'amber' },
      { x: 67, y: 109, r: 13, hue: 'amber' },
      { x: 75, y: 57, r: 13, hue: 'amber' },
    ],
  },
  {
    // A row of stones; one drop passes a gap, two fused do not.
    id: 16, code: '16', name: '石のむこう', hint: '一粒ずつなら、通れる。', par: 3, min: 2,
    stones: [{ x: 100, y: 280, r: 30 }, { x: 210, y: 280, r: 30 }, { x: 320, y: 280, r: 30 }],
    drops: [
      { x: 120, y: 440, r: 18, hue: 'cyan' },
      { x: 300, y: 470, r: 18, hue: 'cyan' },
      { x: 240, y: 130, r: 18, hue: 'cyan' },
      { x: 210, y: 400, r: 18, hue: 'rose' },
      { x: 90, y: 150, r: 18, hue: 'rose' },
      { x: 340, y: 120, r: 18, hue: 'rose' },
    ],
  },
  {
    // A rack of three colours and a cue drop, as in billiards.
    id: 17, code: '17', name: 'ブレイク', hint: 'まず、崩す。', par: 3, min: 2,
    drops: [
      { x: 210, y: 480, r: 20, hue: 'cyan' },
      { x: 210, y: 170, r: 15, hue: 'amber' },
      { x: 194, y: 198, r: 15, hue: 'rose' },
      { x: 226, y: 198, r: 15, hue: 'cyan' },
      { x: 178, y: 226, r: 15, hue: 'cyan' },
      { x: 210, y: 226, r: 15, hue: 'amber' },
      { x: 242, y: 226, r: 15, hue: 'rose' },
    ],
  },
  {
    // The finale: eight drops along one long banked, swaying path.
    id: 18, code: '18', name: 'おおきなひとふで', hint: '長い一打。左の壁で折り返して。', par: 2, min: 1,
    drops: [
      { x: 365, y: 505, r: 22, hue: 'cyan' },
      { x: 286, y: 421, r: 13, hue: 'cyan' },
      { x: 216, y: 381, r: 13, hue: 'cyan' },
      { x: 173, y: 318, r: 13, hue: 'cyan' },
      { x: 84, y: 249, r: 13, hue: 'cyan' },
      { x: 60, y: 188, r: 13, hue: 'cyan' },
      { x: 108, y: 130, r: 13, hue: 'cyan' },
      { x: 117, y: 64, r: 13, hue: 'cyan' },
    ],
  },
];
