import { inside, MAKER_PAD, type Layout, type Selection, type StonePiece } from './layout';
import { SHOT_BOARD } from '../hitofude/simulation';

/**
 * The stage maker's onboarding (2026-10-02, RYO's design). Two phases:
 * 1. An empty board and nothing but a line of text. Place 3 drops, then 2
 *    stones (no sizes, no shapes yet), try it, and clear it to go on.
 * 2. "A studio, made for you": the full editor with a short guided tour,
 *    stressing that only a stage you have cleared yourself can be shared,
 *    then a white fade.
 * Only a first visit to the editor (not a shared stage) starts it.
 */
export const MAKER_WELCOME_KEY = 'pura-flow-maker-welcome-v1';
export const FIRST_DROPS = 3;
export const FIRST_STONES = 2;
export const FIRST_DROP_R = 26;
export const FIRST_STONE_R = 32;
export const FIRST_NAME = 'わたしの世界';

export function makerWelcomed(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return !!storage && storage.getItem(MAKER_WELCOME_KEY) !== null; } catch { return true; }
}
export function markMakerWelcomed(storage: Pick<Storage, 'setItem'> | null) {
  try { storage?.setItem(MAKER_WELCOME_KEY, '1'); } catch { /* shown again next time */ }
}

export const emptyLayout = (): Layout => ({ name: FIRST_NAME, drops: [], stones: [] });

export type FirstStep = 'drops' | 'stones' | 'ready';
/** What the empty board asks for next. */
export function firstStep(layout: Layout): FirstStep {
  if (layout.drops.length < FIRST_DROPS) return 'drops';
  if (layout.stones.length < FIRST_STONES) return 'stones';
  return 'ready';
}

/** The same rules as the editor: inside the walls and a little apart from everything else (`except` is the piece itself). */
export function canPlace(layout: Layout, piece: StonePiece, except: Selection | null = null): boolean {
  if (!inside(piece)) return false;
  const others = [
    ...layout.drops.map((p, index) => ({ p, kind: 'drop' as const, index })),
    ...layout.stones.map((p, index) => ({ p, kind: 'stone' as const, index })),
  ].filter(o => !(except && o.kind === except.kind && o.index === except.index));
  return others.every(({ p }) => Math.hypot(p.x - piece.x, p.y - piece.y) >= p.r + piece.r + 8);
}

/** Keep a dragged piece inside the walls. */
export function clampPiece(piece: StonePiece, x: number, y: number): StonePiece {
  return {
    ...piece,
    x: Math.round(Math.max(MAKER_PAD + piece.r + 2, Math.min(SHOT_BOARD.width - MAKER_PAD - piece.r - 2, x))),
    y: Math.round(Math.max(MAKER_PAD + piece.r + 2, Math.min(SHOT_BOARD.height - MAKER_PAD - piece.r - 2, y))),
  };
}

/** The guided tour of the studio. `target` names a `data-tour` element; none is a plain message. */
export type TourStep = { target: string | null; line: string; sub?: string };
export const TOUR: TourStep[] = [
  { target: null, line: 'あなたのために、スタジオを用意しました。', sub: 'ここでは、もっといろいろなことができます。' },
  { target: 'tools', line: '雫と石を、置く。', sub: '「選ぶ」で、置いたものを動かせます。' },
  { target: 'inspector', line: '大きさ、形、向き。', sub: '選んだ雫や石を、細かく変えられます。' },
  { target: 'tones', line: '盤の色も、選べます。' },
  { target: 'status', line: 'いちばん大切なこと。', sub: 'ステージになるのは、あなた自身がクリアした台だけ。クリアすると、ここが緑になります。' },
  { target: 'play', line: '変えたら、もう一度クリア。', sub: '台を変えると印は消えます。「遊んで確かめる」で、また緑に。' },
  { target: 'share', line: '緑の台は、友だちへ。', sub: 'リンクを渡すと、そのまま挑戦できます。' },
];
