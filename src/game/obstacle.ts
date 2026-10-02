/**
 * Fixed obstacles ("stones"). A stone is a circle (the original, and still the
 * default) or a regular polygon: `n` sides on a circle of radius `r` (the
 * circumradius), turned `a` degrees. Angles are in board coordinates (y down),
 * so a = 0 puts a corner on the right, and a triangle with a = 270 (or 30) points up.
 * The stage maker keeps `a` within one repeat (360 / n).
 * Pure geometry, so Node tests can use it.
 */
export type Obstacle = { x: number; y: number; r: number; n?: number; a?: number };
export const SIDES = [3, 4, 6] as const;

export const isPolygon = (o: Obstacle): o is Obstacle & { n: number } => typeof o.n === 'number' && o.n >= 3;

export function polygonVertices(o: Obstacle & { n: number }): { x: number; y: number }[] {
  const start = (o.a ?? 0) * Math.PI / 180;
  return Array.from({ length: o.n }, (_, i) => { const t = start + i * 2 * Math.PI / o.n; return { x: o.x + o.r * Math.cos(t), y: o.y + o.r * Math.sin(t) }; });
}

export type Contact = { nx: number; ny: number; /** Where the circle's centre must be to just touch. */ x: number; y: number };

/**
 * A circle (centre `cx, cy`, radius `cr`) against a convex polygon obstacle:
 * null when apart, else the outward normal and the centre pushed out to touch.
 * A centre inside the polygon is pushed out through the nearest face.
 */
export function polygonContact(o: Obstacle & { n: number }, cx: number, cy: number, cr: number): Contact | null {
  const v = polygonVertices(o);
  let inside = true, best = -Infinity, bnx = 0, bny = 0, bs = 0;
  let closest = Infinity, qx = 0, qy = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
    // Edges run in increasing angle (clockwise on screen); the outward normal is to the right of the edge.
    const nx = ey / len, ny = -ex / len;
    const s = (cx - a.x) * nx + (cy - a.y) * ny;
    if (s > 0) inside = false;
    if (s > best) { best = s; bnx = nx; bny = ny; bs = s; }
    const t = Math.max(0, Math.min(1, ((cx - a.x) * ex + (cy - a.y) * ey) / (len * len)));
    const px = a.x + ex * t, py = a.y + ey * t, d = Math.hypot(cx - px, cy - py);
    if (d < closest) { closest = d; qx = px; qy = py; }
  }
  if (inside) return { nx: bnx, ny: bny, x: cx + bnx * (cr - bs), y: cy + bny * (cr - bs) };
  if (closest >= cr - 1e-8) return null;
  const nx = closest > 1e-8 ? (cx - qx) / closest : bnx, ny = closest > 1e-8 ? (cy - qy) / closest : bny;
  return { nx, ny, x: qx + nx * cr, y: qy + ny * cr };
}
