/**
 * Builds the daily holes for ひとふで (src/experiments/hitofude/daily-holes.ts).
 *
 *   npx tsx scripts/hitofude-daily.ts <count> [firstSeed] > out.json
 *
 * Each candidate is grown along the path a real shot takes (so one shot is
 * known to clear it), with a few single drops of other colours as hazards
 * off that path (a colour with one drop is already gathered). Then every
 * one-shot try is searched; a candidate is kept only when its clearing
 * shots are neither trivial nor a knife-edge.
 */
import { HitofudeSimulation, MAX_PULL, type ShotBoard } from '../src/experiments/hitofude/simulation';
import type { BoardDrop } from '../src/experiments/boards';
import type { HueId } from '../src/game/palette';
import { replay } from './hitofude-solve';

const HUES: HueId[] = ['cyan', 'rose', 'amber'];
const PAD = 22;
/** Kept when this many of the ~30k one-shot tries clear it. */
const KEEP = { min: 40, max: 1500 };

function rng(seed: number) {
  let s = seed | 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
}

type Path = { s: number; x: number; y: number }[];
function trace(drops: BoardDrop[], deg: number, power: number): { path: Path; cleared: boolean } {
  const sim = new HitofudeSimulation({ id: 0, code: '', name: '', hint: '', par: 9, min: 1, drops });
  const d = sim.core.drops[0];
  sim.grab(d.id);
  const a = deg * Math.PI / 180;
  sim.move(d.x - Math.cos(a) * power * MAX_PULL, d.y - Math.sin(a) * power * MAX_PULL); sim.release();
  const hue = drops[0].hue, path: Path = [];
  let s = 0, prev: { x: number; y: number } | null = null;
  for (let t = 0; t < 9; t += 1 / 60) {
    sim.tick(1 / 60);
    const q = [...sim.core.drops].filter(q => q.pigment[hue] > 0).sort((p, r) => r.mass - p.mass)[0];
    if (prev) s += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = { x: q.x, y: q.y }; path.push({ s, x: q.x, y: q.y });
    if (sim.atRest && t > 0.2) break;
  }
  return { path, cleared: sim.remaining === 0 };
}

export function candidate(seed: number): { board: ShotBoard; shot: { deg: number; power: number } } | null {
  const random = rng(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const hue = pick(HUES);
  const shooter: BoardDrop = { x: Math.round(70 + random() * 280), y: Math.round(470 + random() * 40), r: Math.round(20 + random() * 6), hue };
  const deg = Math.round(215 + random() * 110), power = +(0.8 + random() * 0.2).toFixed(2);
  const drops: BoardDrop[] = [shooter];
  const count = 4 + Math.floor(random() * 4);
  let reached = 0;
  for (let i = 0; i < count; i++) {
    const { path } = trace(drops, deg, power);
    const target = reached + 60 + random() * 45;
    const k = path.findIndex(q => q.s >= target);
    if (k < 3) return null;
    const p = path[k], b = path[k - 3], len = Math.hypot(p.x - b.x, p.y - b.y) || 1;
    const off = (i % 2 ? 1 : -1) * random() * 14;
    const r = Math.round(12 + random() * 5);
    const x = Math.round(p.x - (p.y - b.y) / len * off), y = Math.round(p.y + (p.x - b.x) / len * off);
    if (x - r < PAD + 4 || x + r > 420 - PAD - 4 || y - r < PAD + 4 || y + r > 560 - PAD - 4) return null;
    if (drops.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + 14)) return null;
    drops.push({ x, y, r, hue });
    reached = target;
  }
  const { path, cleared } = trace(drops, deg, power);
  if (!cleared) return null;
  // One to three hazards of other colours, clear of the path and of each other.
  const hazards = 1 + Math.floor(random() * 3);
  for (let i = 0, tries = 0; i < hazards && tries < 200; tries++) {
    const r = Math.round(14 + random() * 8);
    const x = Math.round(PAD + r + 8 + random() * (420 - 2 * (PAD + r + 8))), y = Math.round(PAD + r + 8 + random() * (560 - 2 * (PAD + r + 8)));
    if (path.some(q => Math.hypot(q.x - x, q.y - y) < r + 50)) continue;
    if (drops.some(d => Math.hypot(d.x - x, d.y - y) < d.r + r + 30)) continue;
    drops.push({ x, y, r, hue: pick(HUES.filter(h => h !== hue && !drops.some(d => d.hue === h))) ?? pick(HUES.filter(h => h !== hue)) });
    i++;
  }
  // Each hazard colour must stay a single drop, or the hole would need more gathering.
  for (const h of HUES) if (h !== hue && drops.filter(d => d.hue === h).length > 1) return null;
  const board: ShotBoard = { id: 0, code: '', name: '', hint: '', par: 2, min: 1, drops };
  if (!replay(board, [{ id: 1000, angle: deg * Math.PI / 180, power }]).result?.cleared) return null;
  return { board, shot: { deg, power } };
}

/** How many one-shot tries clear the board (1° × 0.05 power, every drop of the main colour). */
export function window(board: ShotBoard) {
  const start = new HitofudeSimulation(board);
  const main = board.drops[0].hue;
  let clears = 0;
  for (const d of start.core.drops.filter(d => d.pigment[main] > 0)) for (let a = 0; a < 360; a++) for (let p = 0.2; p <= 1.0001; p += 0.05) {
    if (replay(board, [{ id: d.id, angle: a * Math.PI / 180, power: +p.toFixed(2) }]).result?.cleared) clears++;
  }
  return clears;
}

if (process.argv[1]?.endsWith('hitofude-daily.ts')) {
  const want = Number(process.argv[2] ?? 5), first = Number(process.argv[3] ?? 1);
  const kept: unknown[] = [];
  for (let seed = first; kept.length < want && seed < first + 400; seed++) {
    const c = candidate(seed);
    if (!c) continue;
    const clears = window(c.board);
    console.error(`seed ${seed}: ${c.board.drops.length} drops, ${clears} clearing tries${clears >= KEEP.min && clears <= KEEP.max ? ' — kept' : ''}`);
    if (clears >= KEEP.min && clears <= KEEP.max) kept.push({ seed, clears, shot: c.shot, drops: c.board.drops });
  }
  console.log(JSON.stringify(kept));
}
