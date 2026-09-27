import assert from 'node:assert/strict';
import test from 'node:test';
import { ENDLESS_BOARD, ENDLESS_COUNTS, EndlessSimulation, isSorted, POP_AFTER, POP_GAP, scatter } from '../src/experiments/endless/simulation';
import { dominantHue } from '../src/game/palette';

const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
const run = (sim: EndlessSimulation, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) sim.tick(1 / 60); };
/** Bring every colour together (as a player would), until the round is sorted. */
function sortAll(sim: EndlessSimulation) {
  const spots = { cyan: [110, 150], rose: [310, 150], amber: [210, 420] } as const;
  for (const d of sim.core.drops) { const [x, y] = spots[dominantHue(d.pigment)]; d.x = x; d.y = y; d.vx = d.vy = 0; }
  for (let i = 0; i < 120 && sim.phase === 'gather'; i++) sim.tick(1 / 60);
}
const touching = (drops: { x: number; y: number; r: number }[]) =>
  drops.some((a, i) => drops.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r));

test('a scatter: the count asked for, three colours in turn, inside the board, nothing touching', () => {
  for (const count of ENDLESS_COUNTS) {
    const drops = scatter(count, seeded(count), ENDLESS_BOARD.width, ENDLESS_BOARD.height, 22, [{ x: 210, y: 280, r: 60 }]);
    assert.equal(drops.length, count);
    for (const hue of ['cyan', 'rose', 'amber']) assert.equal(drops.filter(d => d.hue === hue).length, count / 3);
    assert.ok(!touching(drops), `${count}: nothing touches`);
    assert.ok(drops.every(d => d.x - d.r >= 22 && d.x + d.r <= ENDLESS_BOARD.width - 22 && d.y - d.r >= 22 && d.y + d.r <= ENDLESS_BOARD.height - 22));
    assert.ok(drops.every(d => Math.hypot(d.x - 210, d.y - 280) > d.r + 60), 'clear of the drops still waiting to pop');
  }
});

test('a fresh board waits for the player: nothing fuses or sorts on its own', () => {
  const sim = new EndlessSimulation(seeded(7));
  assert.equal(sim.core.drops.length, ENDLESS_COUNTS[0], 'the first round is the short one');
  run(sim, 3);
  assert.equal(sim.core.drops.length, ENDLESS_COUNTS[0]);
  assert.equal(sim.phase, 'gather');
  assert.equal(sim.remaining, ENDLESS_COUNTS[0] - 3);
  assert.equal(isSorted(sim.core.drops), false);
});

test('sorted, then each big drop pops into the next round, endlessly', () => {
  const sim = new EndlessSimulation(seeded(11));
  for (let round = 1; round <= 5; round++) {
    sortAll(sim);
    assert.equal(sim.phase, 'sorted', `round ${round} sorted`);
    assert.equal(sim.sorted, round);
    assert.equal(sim.core.drops.length, 3, 'one drop per colour');
    assert.ok(sim.core.drops.every(d => d.pigment[dominantHue(d.pigment)] === d.mass), 'other colours never mixed in');
    assert.equal(sim.remaining, 0);
    sim.splits = [];
    run(sim, POP_AFTER - 0.2);
    assert.equal(sim.splits.length, 0, 'the chime and glow first');
    run(sim, 0.2 + POP_GAP * 2 + 0.1);
    assert.equal(sim.splits.length, 3, 'three pops, one per colour');
    assert.deepEqual(new Set(sim.splits.map(s => dominantHue(s.children[0].pigment))), new Set(['cyan', 'rose', 'amber']));
    assert.equal(sim.phase, 'gather');
    assert.ok((ENDLESS_COUNTS as readonly number[]).includes(sim.core.drops.length), `a new round of ${sim.core.drops.length}`);
    assert.ok(!touching(sim.core.drops), 'the new drops do not touch');
    run(sim, 1);
    assert.ok(sim.core.drops.length >= ENDLESS_COUNTS[0], 'and wait for the player again');
  }
});

test('the chime is the colour that closed the round; a held drop that pops is let go', () => {
  const sim = new EndlessSimulation(seeded(3));
  // Gather all but one amber, then bring that last one in.
  const spots = { cyan: [110, 150], rose: [310, 150], amber: [210, 420] } as const;
  const lastAmber = sim.core.drops.filter(d => dominantHue(d.pigment) === 'amber').at(-1)!;
  for (const d of sim.core.drops) if (d !== lastAmber) { const [x, y] = spots[dominantHue(d.pigment)]; d.x = x; d.y = y; }
  run(sim, 1);
  assert.equal(sim.phase, 'gather');
  lastAmber.x = 210; lastAmber.y = 420;
  run(sim, 0.2);
  assert.equal(sim.phase, 'sorted');
  assert.equal(sim.lastHue, 'amber');
  const big = sim.core.drops[0];
  assert.ok(sim.grab(big.id));
  run(sim, POP_AFTER + POP_GAP * 3);
  assert.equal(sim.core.grabbedId, null, 'the popped drop is not held any more');
});
