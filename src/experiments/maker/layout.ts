import { SHOT_BOARD, type ShotBoard, type Stone } from '../hitofude/simulation';
import type { BoardDrop } from '../boards';

export const DROP_SIZES = [20, 26, 32] as const;
export const STONE_SIZES = [24, 32, 40] as const;
export const MAX_DROPS = 12;
export const MAX_STONES = 3;
export const MAKER_PAD = 22;
export type Piece = { x: number; y: number; r: number };
export type Layout = { name: string; drops: Piece[]; stones: Piece[] };
export type Selection = { kind: 'drop' | 'stone'; index: number };
export const STARTER: Layout = {
  name: 'わたしのひとふで',
  drops: [{ x: 130, y: 470, r: 26 }, { x: 173, y: 385, r: 20 }, { x: 209, y: 314, r: 20 }, { x: 245, y: 242, r: 20 }, { x: 281, y: 171, r: 20 }],
  stones: [],
};
export function cloneLayout(layout: Layout): Layout {
  return { name: layout.name, drops: layout.drops.map(p => ({ ...p })), stones: layout.stones.map(p => ({ ...p })) };
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
  const read = (list: unknown[], sizes: readonly number[]): Piece[] | null => {
    const out: Piece[] = [];
    for (const value of list) {
      if (!value || typeof value !== 'object') return null;
      const p = value as Piece;
      if (![p.x, p.y, p.r].every(Number.isInteger) || !sizes.includes(p.r)) return null;
      const piece = { x: p.x, y: p.y, r: p.r };
      if (!inside(piece)) return null;
      out.push(piece);
    }
    return out;
  };
  const drops = read(o.drops, DROP_SIZES), stones = read(o.stones, STONE_SIZES);
  if (!drops || !stones) return null;
  const all = [...drops, ...stones];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < all[i].r + all[j].r + 8) return null;
  }
  return { name: cleanName(o.name), drops, stones };
}
export function selectedPiece(layout: Layout, selection: Selection | null) {
  return selection ? (selection.kind === 'drop' ? layout.drops : layout.stones)[selection.index] ?? null : null;
}
export function replacePiece(layout: Layout, selection: Selection, patch: Partial<Piece>): Layout | null {
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
