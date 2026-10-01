import { SHOT_BOARD, type ShotBoard, type Stone } from '../hitofude/simulation';
import type { BoardDrop } from '../boards';

export const DROP_SIZES = [20, 26, 32] as const;
export const STONE_SIZES = [24, 32, 40] as const;
export const MAX_DROPS = 12;
export const MAX_STONES = 3;
export const MAKER_PAD = 22;
export type Piece = { x: number; y: number; r: number };
/** A stone: a circle, or a regular polygon of `n` sides turned `a` degrees (15° steps). See game/obstacle.ts. */
export type StonePiece = Piece & { n?: 3 | 4 | 6; a?: number };
export const ANGLE_STEP = 15;
/** The shapes a stone can take (2026-10-02, RYO: obstacles of several shapes, at least triangles and squares). `a` is the starting angle, within one repeat (360 / n). */
export const STONE_SHAPES = [
  { id: 'circle', label: '丸', n: undefined, a: undefined },
  { id: 'triangle', label: '三角', n: 3, a: 30 }, // a corner up (30° = 270° for a triangle)
  { id: 'square', label: '四角', n: 4, a: 45 },
  { id: 'hexagon', label: '六角', n: 6, a: 0 },
] as const;
export type StoneShapeId = typeof STONE_SHAPES[number]['id'];
export function shapeOf(stone: StonePiece): StoneShapeId { return stone.n === 3 ? 'triangle' : stone.n === 4 ? 'square' : stone.n === 6 ? 'hexagon' : 'circle'; }
/** Turning repeats after a full turn divided by the sides, so the angle is kept within one repeat. */
export function turned(stone: StonePiece, steps = 1): StonePiece {
  if (!stone.n) return stone;
  const period = 360 / stone.n, next = ((((stone.a ?? 0) + steps * ANGLE_STEP) % period) + period) % period;
  return { ...stone, a: next };
}
/**
 * Board colours (2026-10-02, RYO: pastel boards to choose from). A tint of the
 * gallery floor; presentation only, so it is not part of the geometry a
 * clear certificate covers, and it travels with a shared stage.
 */
export const TONES = [
  { id: 'white', label: '白', floor: null, background: null, swatch: '#e4e0d8' },
  // The floor is lit softly, so it shows about 0.4 × the colour given + 107 (measured on screen);
  // these are chosen so the lit floor reads as the pastel in `swatch`.
  { id: 'mint', label: 'ミント', floor: '#c8feda', background: '#c8feda', swatch: '#cfe8da' },
  { id: 'sakura', label: 'さくら', floor: '#febfdb', background: '#febfdb', swatch: '#f2d5de' },
  { id: 'lavender', label: 'ラベンダー', floor: '#ddc9fd', background: '#ddc9fd', swatch: '#ddd5f1' },
  { id: 'lemon', label: 'レモン', floor: '#feed97', background: '#feed97', swatch: '#f1e9bd' },
  { id: 'sky', label: 'そら', floor: '#b4e8fe', background: '#b4e8fe', swatch: '#cfe3f2' },
  { id: 'peach', label: 'ピーチ', floor: '#fecd9c', background: '#fecd9c', swatch: '#f6dac7' },
] as const;
export type ToneId = typeof TONES[number]['id'];
export const toneOf = (id: unknown) => TONES.find(t => t.id === id) ?? TONES[0];
export type Layout = { name: string; drops: Piece[]; stones: StonePiece[]; tone?: ToneId };
export type Selection = { kind: 'drop' | 'stone'; index: number };
export const STARTER: Layout = {
  name: 'わたしのひとふで',
  drops: [{ x: 130, y: 470, r: 26 }, { x: 173, y: 385, r: 20 }, { x: 209, y: 314, r: 20 }, { x: 245, y: 242, r: 20 }, { x: 281, y: 171, r: 20 }],
  stones: [],
};
export function cloneLayout(layout: Layout): Layout {
  return { name: layout.name, drops: layout.drops.map(p => ({ ...p })), stones: layout.stones.map(p => ({ ...p })), ...(layout.tone ? { tone: layout.tone } : {}) };
}
export function cleanName(value: string) { return Array.from(value.trim()).slice(0, 32).join('') || 'わたしのひとふで'; }
export function geometryKey(layout: Layout) { return JSON.stringify([layout.drops, layout.stones]); }
export function inside(piece: Piece) {
  return piece.x - piece.r >= MAKER_PAD + 2 && piece.x + piece.r <= SHOT_BOARD.width - MAKER_PAD - 2
    && piece.y - piece.r >= MAKER_PAD + 2 && piece.y + piece.r <= SHOT_BOARD.height - MAKER_PAD - 2;
}
/** Strict input bounds also keep a shared board small and cheap to replay. */
export function readLayout(value: unknown): Layout | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Partial<Layout>;
  if (typeof o.name !== 'string' || o.name.length > 128 || !Array.isArray(o.drops) || !Array.isArray(o.stones)) return null;
  if (o.drops.length < 2 || o.drops.length > MAX_DROPS || o.stones.length > MAX_STONES) return null;
  const read = <T extends StonePiece>(list: unknown[], sizes: readonly number[], shaped: boolean): T[] | null => {
    const out: T[] = [];
    for (const value of list) {
      if (!value || typeof value !== 'object') return null;
      const p = value as StonePiece;
      if (![p.x, p.y, p.r].every(Number.isInteger) || !sizes.includes(p.r)) return null;
      const piece: StonePiece = { x: p.x, y: p.y, r: p.r };
      if (!inside(piece)) return null;
      // A polygon's sides and angle are strict: only 3, 4 or 6 sides, turned in whole 15° steps within one repeat.
      if (shaped && p.n !== undefined) {
        if (![3, 4, 6].includes(p.n)) return null;
        const a = p.a ?? 0;
        if (!Number.isInteger(a) || a < 0 || a % ANGLE_STEP !== 0 || a >= 360 / p.n) return null;
        piece.n = p.n; piece.a = a;
      } else if (shaped && p.a !== undefined) return null;
      out.push(piece as T);
    }
    return out;
  };
  const drops = read<Piece>(o.drops, DROP_SIZES, false), stones = read<StonePiece>(o.stones, STONE_SIZES, true);
  if (!drops || !stones) return null;
  const all = [...drops, ...stones];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < all[i].r + all[j].r + 8) return null;
  }
  // An unknown or white tone is the default and is not written.
  const tone = toneOf(o.tone).id;
  return { name: cleanName(o.name), drops, stones, ...(tone === 'white' ? {} : { tone }) };
}
export function selectedPiece(layout: Layout, selection: Selection | null): StonePiece | null {
  return selection ? (selection.kind === 'drop' ? layout.drops : layout.stones)[selection.index] ?? null : null;
}
export function replacePiece(layout: Layout, selection: Selection, patch: Partial<StonePiece>): Layout | null {
  const next = cloneLayout(layout), list = selection.kind === 'drop' ? next.drops : next.stones;
  if (!list[selection.index]) return null;
  list[selection.index] = { ...list[selection.index], ...patch };
  return readLayout(next);
}
export function movePiece(layout: Layout, selection: Selection, x: number, y: number) {
  const p = selectedPiece(layout, selection);
  if (!p) return null;
  return replacePiece(layout, selection, {
    x: Math.round(Math.max(MAKER_PAD + p.r + 2, Math.min(SHOT_BOARD.width - MAKER_PAD - p.r - 2, x))),
    y: Math.round(Math.max(MAKER_PAD + p.r + 2, Math.min(SHOT_BOARD.height - MAKER_PAD - p.r - 2, y))),
  });
}
export function shotBoard(layout: Layout): ShotBoard {
  return { id: 9000, code: 'MY', name: layout.name, hint: '引いて、離して、ひとつに。', par: 9, min: 1,
    drops: layout.drops.map(p => ({ ...p, hue: 'cyan' })) as BoardDrop[], stones: layout.stones.map(p => ({ ...p })) as Stone[] };
}
