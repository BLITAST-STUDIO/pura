import { getLevel, type LevelDef } from '../../game/levels';
import type { HueId } from '../../game/palette';
import type { BoardDrop } from '../boards';
import { CHAPTERS as THREE_ROADS, type Chapter as ThreeRoad } from '../purity-scene/chapters';

/**
 * 道 (the path): the course reorganised into four chapters, each board
 * showing one phenomenon (DESIGN_DIRECTION.md, approved 2026-09-26). One set
 * of rules throughout, the original PURA's: same colours fuse on contact,
 * other colours bounce, a held press mixes, a quick double tap separates.
 *
 * Boards come from three places, all on the stages' 420×560 board:
 * - the eight original stages (their colours, counts, radii ×1.5, quotas,
 *   purity and currents; placed by the stages' seeded spawner),
 * - the three boards of 三つの道, scaled uniformly into the frame so routes
 *   and gaps keep their proportions (their free-contact rule is replaced),
 * - boards designed for this course.
 */
export const MICHI_BOARD = { width: 420, height: 560 };

export type Ring = { hue: 'cyan' | 'rose'; x: number; y: number; r: number };
export type MichiBoard = LevelDef & {
  /** Hand-placed drops; without them the original stage's spawner places them. */
  layout?: BoardDrop[];
  /** The original stage this board is, so its seeded placement matches the stages screen. */
  origin?: number;
  stones?: { x: number; y: number; r: number }[];
  /** Deliver each colour, gathered and pure, into its ring (instead of building cores). */
  rings?: Ring[];
  /** A quiet line offered only if the player has not separated anything by then. */
  discovery?: { after: number; text: string };
};
export type MichiChapter = { id: number; name: string; lead: string; boards: MichiBoard[] };

const designed = { perColor: 0, rMin: 0, rMax: 0 } as const;

function original(id: number, code: string): MichiBoard {
  return { ...getLevel(id)!, id: Number(code.replace('-', '')), code, origin: id };
}

/** A 三つの道 board fitted into the frame: one uniform scale, centred. */
function fromThreeRoad(road: ThreeRoad, code: string, name: string, hint: string): MichiBoard {
  const s = Math.min(MICHI_BOARD.width / road.width, MICHI_BOARD.height / road.height);
  const ox = (MICHI_BOARD.width - road.width * s) / 2, oy = (MICHI_BOARD.height - road.height * s) / 2;
  const at = <T extends { x: number; y: number; r: number }>(o: T): T => ({ ...o, x: +(o.x * s + ox).toFixed(1), y: +(o.y * s + oy).toFixed(1), r: +(o.r * s).toFixed(1) });
  const colors = [...new Set(road.drops.map(d => d.hue))] as HueId[];
  return {
    id: Number(code.replace('-', '')), code, name, hint, colors, targetFrac: 1, purity: road.purity, ...designed,
    layout: road.drops.map(d => at(d)), stones: road.obstacles.map(at), rings: road.goals.map(at),
  };
}

/** Same colours pull together within 12 units; keep scaled rows apart so nothing fuses before a touch (requirement 7.2). */
const START_GAP = 14;
function gapped(board: MichiBoard): MichiBoard {
  const layout = board.layout!.map(d => ({ ...d }));
  for (let pass = 0; pass < 8; pass++) for (const a of layout) for (const b of layout) {
    if (a === b || a.hue !== b.hue) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), need = a.r + b.r + START_GAP;
    if (dist >= need || dist === 0) continue;
    const push = (need - dist) / 2;
    a.x -= dx / dist * push; a.y -= dy / dist * push; b.x += dx / dist * push; b.y += dy / dist * push;
  }
  return { ...board, layout: layout.map(d => ({ ...d, x: +d.x.toFixed(1), y: +d.y.toFixed(1) })) };
}

export const MICHI: MichiChapter[] = [
  {
    id: 1, name: '融ける', lead: '同じ色は、触れるとひとつに。',
    boards: [
      { id: 11, code: '1-1', name: 'ひとつに', hint: '触れて、寄せて、ひとつに。', colors: ['cyan'], targetFrac: 1, purity: 0.99, ...designed,
        layout: [{ x: 140, y: 200, r: 30, hue: 'cyan' }, { x: 280, y: 220, r: 30, hue: 'cyan' }, { x: 210, y: 380, r: 30, hue: 'cyan' }] },
      { id: 12, code: '1-2', name: 'すべらせて', hint: '投げると、滑りながら吸いこむ。', colors: ['cyan'], targetFrac: 1, purity: 0.99, ...designed,
        layout: [{ x: 110, y: 470, r: 28, hue: 'cyan' }, { x: 170, y: 380, r: 18, hue: 'cyan' }, { x: 225, y: 300, r: 18, hue: 'cyan' },
          { x: 280, y: 220, r: 18, hue: 'cyan' }, { x: 335, y: 140, r: 18, hue: 'cyan' }] },
      { id: 13, code: '1-3', name: 'しずく集め', hint: '大きな雫へ、小さな雫を。', colors: ['cyan'], targetFrac: 0.9, purity: 0.99, ...designed,
        layout: [{ x: 210, y: 280, r: 40, hue: 'cyan' },
          ...[[80, 120], [210, 90], [340, 130], [370, 300], [330, 460], [210, 490], [80, 450], [60, 290]].map(([x, y]) => ({ x, y, r: 12, hue: 'cyan' as const }))] },
      original(1, '1-4'),
    ],
  },
  {
    id: 2, name: '避ける', lead: '違う色は、はじき合う。',
    boards: [
      original(2, '2-1'),
      fromThreeRoad(THREE_ROADS[0], '2-2', '澄んだ道', 'シアンをひとつにして、左上の輪へ。ローズははじく。'),
      original(3, '2-3'),
      fromThreeRoad(THREE_ROADS[2], '2-4', 'ふたつの行き先', 'シアンは左の輪へ、ローズは右の輪へ。先に道を空ける色は。'),
    ],
  },
  {
    id: 3, name: '混ぜて、分ける', lead: '押し込むと混ざり、2回たたくと分かれる。',
    boards: [
      /*
       * 3-1: pure cyan alone is 2028 of the 2454 needed (80% of 3068); taking in
       * the cloudy drop's cyan drags purity to 85% (< 90%). Separating its rose
       * (560) purifies the cyan and supplies the rose goal (1152 + 560 of 1370).
       * 3-2: every colour is mostly locked inside two cloudy drops; each goal
       * (75%) needs its pure drop plus what two separations release.
       */
      { id: 31, code: '3-1', name: 'にごり', hint: '濁った雫がひとつ。澄ませるには。', colors: ['cyan', 'rose'], targetFrac: 0.8, purity: 0.9, ...designed,
        layout: [
          { x: 210, y: 300, r: 40, hue: 'cyan', mix: { rose: 0.35 } },
          { x: 100, y: 150, r: 26, hue: 'cyan' }, { x: 330, y: 140, r: 26, hue: 'cyan' }, { x: 110, y: 460, r: 26, hue: 'cyan' },
          { x: 320, y: 460, r: 24, hue: 'rose' }, { x: 320, y: 300, r: 24, hue: 'rose' },
        ],
        discovery: { after: 25, text: '濁った雫を、すばやく2回たたくと……' } },
      { id: 32, code: '3-2', name: 'ほどく', hint: '絡んだ色を、ほどいて集める。', colors: ['cyan', 'rose', 'amber'], targetFrac: 0.75, purity: 0.9, ...designed,
        layout: [
          { x: 120, y: 170, r: 38, hue: 'cyan', mix: { rose: 0.4 } }, { x: 300, y: 170, r: 38, hue: 'amber', mix: { cyan: 0.4 } },
          { x: 210, y: 390, r: 34, hue: 'rose', mix: { amber: 0.4 } },
          { x: 330, y: 470, r: 22, hue: 'cyan' }, { x: 90, y: 470, r: 22, hue: 'rose' }, { x: 210, y: 262, r: 22, hue: 'amber' },
        ],
        discovery: { after: 40, text: 'ひとつずつ、2回たたいてほどく。' } },
      original(5, '3-3'),
    ],
  },
  {
    id: 4, name: '場', lead: '石、狭さ、流れ、小ささ。',
    boards: [
      gapped(fromThreeRoad(THREE_ROADS[1], '4-1', '小さなうちに', '小さな雫は、石のあいだを通れる。大きくなったら外側から。')),
      original(4, '4-2'),
      original(6, '4-3'),
      original(7, '4-4'),
      original(8, '4-5'),
    ],
  },
];

export const MICHI_BOARDS = MICHI.flatMap(c => c.boards);
export function michiBoard(id: number) { return MICHI_BOARDS.find(b => b.id === id) ?? MICHI_BOARDS[0]; }
export function chapterOf(id: number) { return MICHI.find(c => c.boards.some(b => b.id === id)) ?? MICHI[0]; }
/** The board after this one, across chapters; undefined after the last. */
export function nextBoard(id: number) { const i = MICHI_BOARDS.findIndex(b => b.id === id); return i >= 0 ? MICHI_BOARDS[i + 1] : undefined; }
