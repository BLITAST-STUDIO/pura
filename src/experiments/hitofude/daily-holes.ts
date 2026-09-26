import type { HueId } from '../../game/palette';
import type { ShotBoard } from './simulation';

/**
 * 今日のホール: thirty holes made by scripts/hitofude-daily.ts, one per day
 * in turn. Each was grown along a real shot's path (so one shot clears it)
 * with single drops of other colours as hazards, and kept only when 185–1308
 * of the ~36k one-shot tries clear it. `shot` is that constructing shot
 * (degrees, power); `clears` is the searched count. Par 2 (one shot is the
 * namesake, one under par).
 */
type DailyData = { seed: number; clears: number; shot: [number, number]; drops: [number, number, number, HueId][] };
export const DAILY_DATA: DailyData[] = [
  { seed: 2, clears: 785, shot: [294, 0.82], drops: [[199, 478, 24, 'cyan'], [231, 389, 15, 'cyan'], [274, 308, 15, 'cyan'], [306, 218, 14, 'cyan'], [339, 169, 17, 'cyan'], [128, 116, 17, 'rose'], [69, 218, 15, 'amber']] },
  { seed: 3, clears: 262, shot: [257, 0.97], drops: [[224, 505, 25, 'cyan'], [203, 418, 16, 'cyan'], [199, 350, 15, 'cyan'], [160, 261, 17, 'cyan'], [157, 194, 13, 'cyan'], [128, 125, 13, 'cyan'], [108, 74, 14, 'cyan'], [342, 456, 20, 'amber'], [67, 415, 20, 'rose']] },
  { seed: 4, clears: 613, shot: [220, 0.92], drops: [[250, 492, 25, 'cyan'], [180, 443, 16, 'cyan'], [118, 376, 15, 'cyan'], [48, 315, 14, 'cyan'], [99, 252, 15, 'cyan'], [306, 84, 16, 'amber']] },
  { seed: 7, clears: 248, shot: [220, 0.97], drops: [[326, 494, 26, 'cyan'], [265, 444, 17, 'cyan'], [192, 372, 14, 'cyan'], [117, 329, 16, 'cyan'], [69, 264, 14, 'cyan'], [104, 168, 14, 'cyan'], [317, 215, 20, 'rose']] },
  { seed: 9, clears: 936, shot: [257, 0.87], drops: [[97, 509, 20, 'cyan'], [69, 393, 12, 'cyan'], [62, 301, 14, 'cyan'], [54, 224, 16, 'cyan'], [63, 160, 12, 'cyan'], [244, 249, 20, 'amber'], [125, 222, 15, 'rose']] },
  { seed: 106, clears: 397, shot: [218, 0.98], drops: [[320, 486, 24, 'cyan'], [228, 421, 15, 'cyan'], [158, 355, 13, 'cyan'], [77, 301, 17, 'cyan'], [100, 224, 12, 'cyan'], [347, 186, 18, 'amber'], [199, 272, 19, 'rose']] },
  { seed: 107, clears: 899, shot: [292, 0.93], drops: [[345, 473, 24, 'cyan'], [357, 375, 16, 'cyan'], [356, 299, 13, 'cyan'], [335, 208, 14, 'cyan'], [344, 143, 14, 'cyan'], [313, 64, 16, 'cyan'], [234, 298, 21, 'rose']] },
  { seed: 111, clears: 771, shot: [255, 0.92], drops: [[167, 503, 25, 'cyan'], [129, 414, 17, 'cyan'], [133, 350, 12, 'cyan'], [97, 272, 13, 'cyan'], [92, 181, 15, 'cyan'], [51, 419, 16, 'rose']] },
  { seed: 116, clears: 702, shot: [291, 0.87], drops: [[294, 480, 26, 'cyan'], [330, 366, 13, 'cyan'], [364, 301, 17, 'cyan'], [348, 229, 15, 'cyan'], [343, 147, 12, 'cyan'], [320, 67, 16, 'cyan'], [252, 287, 19, 'amber']] },
  { seed: 118, clears: 738, shot: [218, 0.97], drops: [[345, 495, 20, 'cyan'], [253, 432, 14, 'cyan'], [206, 380, 16, 'cyan'], [140, 352, 15, 'cyan'], [72, 283, 15, 'cyan'], [360, 274, 15, 'amber']] },
  { seed: 204, clears: 363, shot: [253, 0.83], drops: [[289, 490, 21, 'cyan'], [257, 400, 14, 'cyan'], [243, 323, 16, 'cyan'], [213, 268, 15, 'cyan'], [195, 167, 13, 'cyan'], [159, 91, 14, 'cyan'], [357, 232, 21, 'rose']] },
  { seed: 206, clears: 1308, shot: [289, 0.93], drops: [[340, 505, 22, 'cyan'], [367, 412, 14, 'cyan'], [375, 345, 16, 'cyan'], [361, 248, 15, 'cyan'], [364, 177, 16, 'cyan'], [205, 265, 21, 'rose']] },
  { seed: 209, clears: 185, shot: [289, 0.98], drops: [[136, 507, 22, 'cyan'], [151, 428, 15, 'cyan'], [198, 353, 16, 'cyan'], [212, 254, 17, 'cyan'], [255, 174, 16, 'cyan'], [271, 69, 13, 'cyan'], [351, 379, 16, 'rose'], [59, 271, 15, 'amber']] },
  { seed: 213, clears: 680, shot: [253, 0.98], drops: [[238, 496, 23, 'cyan'], [194, 392, 16, 'cyan'], [187, 314, 15, 'cyan'], [147, 235, 16, 'cyan'], [139, 159, 17, 'cyan'], [54, 220, 18, 'amber'], [353, 335, 22, 'rose']] },
  { seed: 215, clears: 925, shot: [289, 0.88], drops: [[288, 471, 24, 'cyan'], [309, 371, 17, 'cyan'], [354, 308, 15, 'cyan'], [361, 224, 16, 'cyan'], [355, 137, 15, 'cyan'], [226, 280, 15, 'amber']] },
  { seed: 301, clears: 446, shot: [324, 0.94], drops: [[233, 507, 25, 'rose'], [307, 443, 16, 'rose'], [375, 416, 15, 'rose'], [317, 343, 16, 'rose'], [292, 249, 13, 'rose'], [357, 113, 18, 'amber'], [129, 225, 17, 'cyan']] },
  { seed: 304, clears: 532, shot: [324, 0.99], drops: [[309, 509, 26, 'rose'], [371, 460, 12, 'rose'], [336, 369, 15, 'rose'], [288, 314, 13, 'rose'], [271, 243, 13, 'rose'], [221, 191, 15, 'rose'], [362, 132, 20, 'cyan']] },
  { seed: 313, clears: 202, shot: [324, 0.93], drops: [[257, 475, 22, 'rose'], [329, 410, 15, 'rose'], [353, 349, 14, 'rose'], [300, 264, 14, 'rose'], [265, 183, 16, 'rose'], [222, 128, 16, 'rose'], [133, 315, 17, 'amber']] },
  { seed: 318, clears: 611, shot: [250, 0.88], drops: [[104, 492, 23, 'rose'], [59, 380, 16, 'rose'], [60, 322, 13, 'rose'], [59, 235, 16, 'rose'], [79, 159, 14, 'rose'], [85, 71, 15, 'rose'], [159, 403, 14, 'amber'], [368, 252, 18, 'cyan']] },
  { seed: 321, clears: 301, shot: [250, 0.93], drops: [[180, 494, 23, 'rose'], [133, 397, 12, 'rose'], [122, 319, 13, 'rose'], [85, 248, 13, 'rose'], [57, 152, 13, 'rose'], [62, 79, 13, 'rose'], [87, 118, 15, 'rose'], [322, 241, 17, 'cyan']] },
  { seed: 401, clears: 689, shot: [285, 0.89], drops: [[252, 486, 23, 'rose'], [264, 414, 15, 'rose'], [298, 326, 14, 'rose'], [309, 238, 14, 'rose'], [337, 181, 13, 'rose'], [125, 125, 19, 'cyan']] },
  { seed: 403, clears: 813, shot: [322, 0.99], drops: [[303, 500, 24, 'rose'], [358, 426, 16, 'rose'], [330, 334, 13, 'rose'], [287, 267, 14, 'rose'], [259, 194, 16, 'rose'], [164, 282, 14, 'cyan']] },
  { seed: 404, clears: 823, shot: [285, 0.94], drops: [[328, 488, 24, 'rose'], [356, 384, 16, 'rose'], [373, 317, 13, 'rose'], [352, 242, 16, 'rose'], [353, 156, 12, 'rose'], [341, 70, 17, 'rose'], [191, 400, 16, 'cyan']] },
  { seed: 406, clears: 302, shot: [322, 0.84], drops: [[99, 502, 24, 'rose'], [182, 436, 17, 'rose'], [231, 412, 13, 'rose'], [279, 351, 16, 'rose'], [366, 301, 15, 'rose'], [318, 216, 12, 'rose'], [61, 165, 16, 'amber'], [52, 269, 21, 'cyan']] },
  { seed: 408, clears: 856, shot: [248, 0.94], drops: [[150, 477, 25, 'rose'], [113, 387, 12, 'rose'], [79, 296, 13, 'rose'], [51, 230, 15, 'rose'], [75, 166, 13, 'rose'], [343, 291, 18, 'amber'], [330, 510, 19, 'cyan']] },
  { seed: 501, clears: 308, shot: [246, 0.84], drops: [[272, 504, 21, 'rose'], [224, 410, 14, 'rose'], [213, 348, 12, 'rose'], [162, 269, 12, 'rose'], [147, 191, 17, 'rose'], [87, 107, 15, 'rose'], [318, 333, 15, 'cyan']] },
  { seed: 505, clears: 755, shot: [319, 0.84], drops: [[94, 494, 22, 'rose'], [156, 432, 15, 'rose'], [240, 375, 17, 'rose'], [296, 313, 16, 'rose'], [354, 286, 13, 'rose'], [298, 451, 18, 'cyan'], [93, 209, 18, 'amber']] },
  { seed: 506, clears: 449, shot: [283, 0.99], drops: [[119, 481, 22, 'rose'], [127, 389, 15, 'rose'], [155, 321, 17, 'rose'], [163, 242, 14, 'rose'], [184, 178, 14, 'rose'], [199, 102, 14, 'rose'], [265, 287, 18, 'amber'], [66, 297, 16, 'cyan']] },
  { seed: 513, clears: 399, shot: [246, 0.84], drops: [[297, 473, 24, 'rose'], [248, 379, 12, 'rose'], [219, 300, 16, 'rose'], [190, 241, 15, 'rose'], [165, 177, 15, 'rose'], [129, 100, 13, 'rose'], [123, 476, 14, 'cyan']] },
  { seed: 515, clears: 881, shot: [283, 0.94], drops: [[347, 488, 24, 'rose'], [362, 391, 13, 'rose'], [371, 316, 15, 'rose'], [355, 253, 15, 'rose'], [361, 166, 13, 'rose'], [351, 94, 14, 'rose'], [201, 420, 15, 'amber'], [219, 72, 19, 'cyan']] },
];

const HINTS = ['今日の一打。', '一度で、ぜんぶ。', '道は、ひとすじ。', 'ゆれる列を追って。', '違う色に、触れないで。', '強さは、ほどほどに。'];
/** Day 0 is 2026-09-27 (local date). */
const FIRST_DAY = Date.UTC(2026, 8, 27);
export const DAILY_BASE_ID = 100;

export const DAILY_HOLES: ShotBoard[] = DAILY_DATA.map((d, i) => ({
  id: DAILY_BASE_ID + i, code: `D${String(i + 1).padStart(2, '0')}`, name: '今日のホール', hint: HINTS[i % HINTS.length], par: 2, min: 1,
  drops: d.drops.map(([x, y, r, hue]) => ({ x, y, r, hue })),
}));

/** Which daily hole a local date plays. */
export function dailyIndex(date: Date) {
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - FIRST_DAY) / 86400000);
  return ((day % DAILY_HOLES.length) + DAILY_HOLES.length) % DAILY_HOLES.length;
}
export const todaysHole = (date = new Date()) => DAILY_HOLES[dailyIndex(date)];
