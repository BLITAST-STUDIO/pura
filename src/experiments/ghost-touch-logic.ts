/** The ghost fingertip's moves (no CSS here, so Node tests can import it). */
export type Ghost =
  | { kind: 'drag' | 'flick'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'pull'; x0: number; y0: number; x1: number; y1: number; dropX: number; dropY: number };

/** Where to demonstrate a pull: from open floor, straight away from where the other drops lie. */
export function pullGhost(drop: { x: number; y: number }, others: { x: number; y: number }[], area: { w: number; h: number }): Ghost {
  const cx = others.length ? others.reduce((n, s) => n + s.x, 0) / others.length : drop.x;
  const cy = others.length ? others.reduce((n, s) => n + s.y, 0) / others.length : drop.y - 100;
  let dx = drop.x - cx, dy = drop.y - cy;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  // Land the finger in the open half of the screen, away from the drop.
  const start = { x: area.w * (drop.x < area.w / 2 ? 0.7 : 0.3), y: area.h * 0.58 };
  return { kind: 'pull', x0: start.x, y0: start.y, x1: start.x + dx * 80, y1: start.y + dy * 80, dropX: drop.x, dropY: drop.y };
}
