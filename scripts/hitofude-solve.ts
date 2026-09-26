/**
 * Board design aid for ひとふで: plays shots in the real simulation (no
 * rendering) and searches for the fewest shots that clear a board.
 *
 *   npx tsx scripts/hitofude-solve.ts [boardId]
 *
 * One shot is searched exhaustively (every drop × angle × power); if none
 * clears, two shots are searched from the best first shots (a beam). The
 * result is the evidence for each board's par and how forgiving the par
 * shot is (the share of nearby angles that also clear).
 */
import { pathToFileURL } from 'node:url';
import { HitofudeSimulation, MAX_PULL, type ShotBoard } from '../src/experiments/hitofude/simulation';
import { SHOT_BOARDS } from '../src/experiments/hitofude/boards';

export type Shot = { id: number; angle: number; power: number };
const STEP = 1 / 60;
const MAX_SECONDS = 9;

/** Aim at `angle` (radians, board axes: +x right, +y down) with `power` 0..1, let go, and run until rest. */
export function playShot(sim: HitofudeSimulation, shot: Shot) {
  const d = sim.core.drops.find(d => d.id === shot.id);
  if (!d || !sim.grab(shot.id)) return false;
  const pull = shot.power * MAX_PULL;
  // Pull back: the finger goes opposite the launch direction.
  sim.move(d.x - Math.cos(shot.angle) * pull, d.y - Math.sin(shot.angle) * pull);
  sim.release();
  for (let t = 0; t < MAX_SECONDS && !(sim.atRest && t > 0.1); t += STEP) {
    sim.tick(STEP);
    if (sim.result?.cleared) break;
  }
  return true;
}

export function replay(board: ShotBoard, shots: Shot[]) {
  const sim = new HitofudeSimulation(board);
  for (const shot of shots) playShot(sim, shot);
  return sim;
}

/** Same-colour spread: lower is closer to done. */
function spread(sim: HitofudeSimulation) {
  let sum = 0;
  const drops = sim.core.drops;
  for (let i = 0; i < drops.length; i++) for (let j = i + 1; j < drops.length; j++) {
    const a = drops[i], b = drops[j];
    const same = Object.entries(a.pigment).sort((x, y) => y[1] - x[1])[0][0] === Object.entries(b.pigment).sort((x, y) => y[1] - x[1])[0][0];
    if (same) sum += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return sum;
}

function candidates(sim: HitofudeSimulation, angleStep: number, powers: number[]): Shot[] {
  const out: Shot[] = [];
  for (const d of sim.core.drops) for (let a = 0; a < 360; a += angleStep) for (const power of powers) out.push({ id: d.id, angle: a * Math.PI / 180, power });
  return out;
}

const range = (from: number, to: number, step: number) => { const r: number[] = []; for (let v = from; v <= to + 1e-9; v += step) r.push(+v.toFixed(3)); return r; };

/** Angles (degrees) grouped into runs, e.g. "278–316, 75–85". */
function runs(angles: number[]) {
  const sorted = [...new Set(angles)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`); i = j;
  }
  return out.join(', ');
}

export function solve(board: ShotBoard, log = console.log, maxDepth = 3, beamWidth = 40) {
  const t0 = Date.now();
  const seconds = () => ((Date.now() - t0) / 1000).toFixed(1);
  const fine = candidates(new HitofudeSimulation(board), 1, range(0.2, 1, 0.05));
  const winners: Shot[] = [];
  let beam: { shots: Shot[]; remaining: number; spread: number }[] = [];
  for (const shot of fine) {
    const sim = replay(board, [shot]);
    if (sim.result?.cleared) winners.push(shot);
    else beam.push({ shots: [shot], remaining: sim.remaining, spread: spread(sim) });
  }
  log(`${board.code} ${board.name}: ${fine.length} one-shot tries in ${seconds()} s, ${winners.length} clear`);
  if (winners.length) {
    const byDrop = new Map<number, Shot[]>();
    for (const w of winners) byDrop.set(w.id, [...(byDrop.get(w.id) ?? []), w]);
    for (const [id, list] of byDrop) {
      const powers = [...new Set(list.map(s => s.power))].sort((a, b) => a - b);
      log(`  drop ${id}: ${list.length} shots, angles ${runs(list.map(s => Math.round(s.angle * 180 / Math.PI)))}°, powers ${powers[0]}–${powers.at(-1)}`);
    }
    return { min: 1, shots: [winners[Math.floor(winners.length / 2)]] };
  }
  const coarse = (sim: HitofudeSimulation) => candidates(sim, 2, range(0.2, 1, 0.1));
  for (let depth = 2; depth <= maxDepth; depth++) {
    beam.sort((a, b) => a.remaining - b.remaining || a.spread - b.spread);
    beam = beam.slice(0, beamWidth);
    const next: typeof beam = [];
    let found: Shot[] | null = null, count = 0;
    for (const state of beam) {
      const start = replay(board, state.shots);
      for (const shot of coarse(start)) {
        const shots = [...state.shots, shot];
        const sim = replay(board, shots);
        if (sim.result?.cleared) { found = shots; count++; }
        else next.push({ shots, remaining: sim.remaining, spread: spread(sim) });
      }
    }
    if (found) {
      log(`  ${depth} shots: ${count} clearing sequences found from the beam, e.g. ${JSON.stringify(found.map(s => ({ id: s.id, deg: Math.round(s.angle * 180 / Math.PI), power: s.power })))} (${seconds()} s)`);
      return { min: depth, shots: found };
    }
    beam = next;
    log(`  no ${depth}-shot clear from the beam (${seconds()} s)`);
  }
  return { min: maxDepth + 1, shots: [] };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = Number(process.argv[2]);
  for (const board of SHOT_BOARDS) if (!only || board.id === only) {
    const { min } = solve(board);
    if (min !== board.min) console.log(`  ! recorded min ${board.min}, found ${min}`);
  }
}
