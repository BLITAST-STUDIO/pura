import assert from 'node:assert/strict';
import test from 'node:test';
import { MichiSimulation } from '../src/experiments/michi/simulation';
import { MICHI, MICHI_BOARD, MICHI_BOARDS, michiBoard, nextBoard } from '../src/experiments/michi/boards';
import { StageSimulation } from '../src/experiments/stages/simulation';
import { boardDrops } from '../src/experiments/boards';
import { getLevel, LEVELS } from '../src/game/levels';
import { addPigment, dominantHue, emptyPigment, purityOf, type HueId, type Pigment } from '../src/game/palette';

const sum = (list: Pigment[]) => list.reduce((a, b) => addPigment(a, b), emptyPigment());
const settle = (sim: MichiSimulation, seconds: number) => { for (let t = 0; t < seconds && !sim.won; t += 1 / 60) sim.tick(1 / 60); };

test('four chapters, sixteen boards, every original stage exactly once with its own rules', () => {
  assert.deepEqual(MICHI.map(c => c.boards.length), [4, 4, 3, 5]);
  assert.equal(new Set(MICHI_BOARDS.map(b => b.id)).size, MICHI_BOARDS.length);
  const origins = MICHI_BOARDS.filter(b => b.origin).map(b => b.origin);
  assert.deepEqual([...origins].sort(), LEVELS.map(l => l.id));
  for (const b of MICHI_BOARDS.filter(b => b.origin)) {
    const level = getLevel(b.origin!)!;
    assert.deepEqual([b.colors, b.perColor, b.targetFrac, b.purity, !!b.currents], [level.colors, level.perColor, level.targetFrac, level.purity, !!level.currents], b.code);
  }
  assert.equal(nextBoard(14)?.code, '2-1', 'the next board crosses into the next chapter');
  assert.equal(nextBoard(45), undefined);
});

test('on every designed board, nothing fuses before the first touch', () => {
  for (const b of MICHI_BOARDS.filter(b => b.layout)) {
    const drops = boardDrops(b.layout!);
    for (const p of drops) for (const q of drops) {
      if (p === q || dominantHue(p.pigment) !== dominantHue(q.pigment)) continue;
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r >= 14 - 1e-6, `${b.code}: same colours start apart`);
    }
    const sim = new MichiSimulation(b.id);
    for (let i = 0; i < 180; i++) sim.tick(1 / 60);
    assert.equal(sim.core.drops.length, b.layout!.length, `${b.code}: still ${b.layout!.length} drops after 3 s untouched`);
  }
});

test('an original stage is placed exactly as on the stages screen (large drops)', () => {
  for (const [code, origin] of [['2-3', 3], ['4-3', 6]] as const) {
    const michi = new MichiSimulation(Number(code.replace('-', '')));
    const stage = new StageSimulation({ stage: origin, scale: 'large', mix: 'press', sandboxCount: 30 });
    assert.deepEqual(michi.core.drops.map(d => [d.x, d.y, d.r]), stage.core.drops.map(d => [d.x, d.y, d.r]), code);
    assert.equal(michi.core.fusionPolicy, 'held-press');
    assert.equal(!!michi.core.level.currents, origin === 6);
  }
});

test('the 三つの道 boards fit the frame and keep their proportions', () => {
  for (const b of MICHI_BOARDS.filter(b => b.rings)) {
    for (const d of [...b.layout!, ...b.stones!, ...b.rings!]) {
      assert.ok(d.x - d.r >= 0 && d.x + d.r <= MICHI_BOARD.width && d.y >= 0 && d.y <= MICHI_BOARD.height, `${b.code} stays inside`);
    }
  }
  // 4-1: one drop fits between the stones, two fused do not (as in the original chapter).
  const gate = michiBoard(41);
  const [a, c] = gate.stones!;
  const gap = Math.hypot(c.x - a.x, c.y - a.y) - a.r - c.r;
  const r = gate.layout![0].r;
  assert.ok(2 * r < gap && 2 * r * Math.SQRT2 > gap, `gap ${gap.toFixed(1)} between ${(2 * r).toFixed(1)} and ${(2 * r * Math.SQRT2).toFixed(1)}`);
});

test('a ring board is finished by resting each gathered, pure colour inside its ring', () => {
  const sim = new MichiSimulation(24);
  const rings = michiBoard(24).rings!;
  // Stack each colour in its ring so it fuses there, then let it rest.
  for (const d of sim.core.drops) { const ring = rings.find(r => r.hue === dominantHue(d.pigment))!; d.x = ring.x; d.y = ring.y + 4; d.vx = d.vy = 0; }
  settle(sim, 0.2);
  assert.ok(sim.rings().every(r => r.ready && r.inRing), 'gathered and inside');
  assert.equal(sim.won, null, 'not yet: it must rest a moment');
  settle(sim, 1);
  assert.equal(sim.won?.stars, 3);
});

test('a held drop, or one still short of its colour, is not delivered', () => {
  const sim = new MichiSimulation(22);
  const ring = michiBoard(22).rings![0];
  const cyan = sim.core.drops.filter(d => d.pigment.cyan > 0);
  cyan[0].x = ring.x; cyan[0].y = ring.y;
  settle(sim, 1.5);
  assert.equal(sim.won, null, 'one of three cyan drops is not all of the colour');
  for (const d of cyan) { d.x = ring.x; d.y = ring.y; d.vx = d.vy = 0; }
  settle(sim, 0.1);
  const gathered = sim.core.drops.find(d => d.pigment.cyan > 0)!;
  sim.grab(gathered.id);
  settle(sim, 1.5);
  assert.equal(sim.won, null, 'still held');
  sim.release();
  settle(sim, 1.5);
  assert.ok(sim.won);
});

test('each chapter 3 cloudy board cannot be completed without separating', () => {
  for (const b of [michiBoard(31), michiBoard(32)]) {
    const drops = boardDrops(b.layout!);
    for (const hue of b.colors) {
      const target = drops.reduce((n, d) => n + d.pigment[hue], 0) * b.targetFrac;
      // Best case without separating: every drop led by this colour, merged.
      const led = sum(drops.filter(d => dominantHue(d.pigment) === hue).map(d => d.pigment));
      const pure = drops.filter(d => purityOf(d.pigment) > 0.995 && dominantHue(d.pigment) === hue).reduce((n, d) => n + d.mass, 0);
      assert.ok(!(led[hue] >= target && purityOf(led) >= b.purity) && pure < target, `${b.name}/${hue}: needs a separation`);
    }
  }
});

test('separating the cloudy drops, then gathering, completes each chapter 3 board', () => {
  for (const id of [31, 32]) {
    const sim = new MichiSimulation(id);
    for (const cloudy of sim.core.drops.filter(d => purityOf(d.pigment) < 0.995)) {
      sim.grab(cloudy.id); sim.release(); sim.tick(0.05); sim.grab(cloudy.id); sim.release();
    }
    settle(sim, 1.5);
    const spots: Record<HueId, [number, number]> = { cyan: [110, 130], rose: [310, 130], amber: [210, 440] };
    for (const d of sim.core.drops) { const [x, y] = spots[dominantHue(d.pigment)]; d.x = x; d.y = y; d.vx = 0; d.vy = 0; }
    settle(sim, 2);
    assert.ok(sim.separations >= michiBoard(id).layout!.filter(d => d.mix).length);
    assert.equal(sim.won?.stars, 3, michiBoard(id).name);
  }
});
