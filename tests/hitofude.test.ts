import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMABLE_SPEED, HitofudeSimulation, launch, MAX_PULL, MIN_PULL, SHOT_SPEED, starsFor, type ShotBoard } from '../src/experiments/hitofude/simulation';
import { SHOT_BOARDS } from '../src/experiments/hitofude/boards';
import { playShot, replay, type Shot } from '../scripts/hitofude-solve';

const rad = (deg: number) => deg * Math.PI / 180;
/** Par solutions found by scripts/hitofude-solve.ts, from the middle of their working ranges. */
const PAR_SOLUTIONS: Record<number, Shot[]> = {
  1: [{ id: 1000, angle: rad(300), power: 0.8 }],
  2: [{ id: 1000, angle: rad(325), power: 0.9 }],
  // Rose first along its diagonal (it holds the crossing), then the cyan diagonal is open.
  3: [{ id: 1004, angle: rad(238), power: 0.8 }, { id: 1000, angle: rad(300), power: 0.8 }],
};

test('every board can be cleared in its par, which earns three stars', () => {
  for (const board of SHOT_BOARDS) {
    const solution = PAR_SOLUTIONS[board.id];
    assert.equal(solution.length, board.par, `${board.name}: the recorded solution uses the par`);
    const sim = replay(board, solution);
    assert.deepEqual(sim.result, { cleared: true, shots: board.par, stars: 3 }, board.name);
    assert.equal(sim.core.drops.length, new Set(board.drops.map(d => d.hue)).size, 'one drop per colour');
  }
});

test('the crossing on board 3 punishes the obvious first shot', () => {
  // Cyan straight up its diagonal meets the rose drop on the crossing and bounces off.
  const sim = replay(SHOT_BOARDS[2], [{ id: 1000, angle: rad(301), power: 0.9 }]);
  assert.ok(sim.remaining > 1);
  assert.equal(sim.groups().get('rose'), 4, 'the rose line is untouched by fusion');
});

test('a shot leaves opposite the pull, scaled by its length, and short pulls do nothing', () => {
  const full = launch(-MAX_PULL * 2, 0)!;
  assert.equal(full.power, 1);
  assert.ok(Math.abs(full.vx - SHOT_SPEED) < 1e-9 && full.vy === 0, 'pulled left, goes right at full speed');
  const half = launch(0, MAX_PULL / 2)!;
  assert.ok(Math.abs(half.vy + SHOT_SPEED / 2) < 1e-9, 'pulled down half way, goes up at half speed');
  assert.equal(launch(MIN_PULL - 1, 0), null);
});

const pair: ShotBoard = { id: 99, code: '99', name: 'test', hint: '', shots: 2, par: 1, drops: [
  { x: 100, y: 280, r: 24, hue: 'cyan' }, { x: 320, y: 280, r: 20, hue: 'cyan' },
] };

test('aiming holds the drop still; letting go counts one shot, a cancelled pull or an interruption none', () => {
  const sim = new HitofudeSimulation(pair);
  assert.ok(sim.grab(1000));
  sim.move(40, 280);
  for (let i = 0; i < 60; i++) sim.tick(1 / 60);
  const held = sim.core.drops.find(d => d.id === 1000)!;
  assert.deepEqual([held.x, held.y, held.vx, held.vy], [100, 280, 0, 0], 'no spring toward the finger while aiming');
  assert.equal(sim.aim?.power, 60 / MAX_PULL);
  assert.ok(sim.aim!.dx === 1 && sim.aim!.dy === 0, 'aimed away from the finger');
  sim.abort();
  assert.equal(sim.shots, 0, 'a blur or pause is not a shot');
  sim.grab(1000); sim.move(95, 280); sim.release();
  assert.equal(sim.shots, 0, 'a tiny pull is cancelled');
  sim.grab(1000); sim.move(40, 280); sim.release();
  assert.equal(sim.shots, 1);
  assert.ok(held.vx > 0);
});

test('a sliding drop cannot be caught, and the board ends when shots run out', () => {
  const sim = new HitofudeSimulation({ ...pair, shots: 1 });
  sim.grab(1001); sim.move(320, 300); sim.release();
  const sliding = sim.core.drops.find(d => d.id === 1001)!;
  sim.tick(1 / 60);
  assert.ok(Math.hypot(sliding.vx, sliding.vy) > AIMABLE_SPEED);
  assert.equal(sim.grab(1001), false, 'no catching a drop in flight');
  for (let t = 0; t < 20 && !sim.result; t += 1 / 60) sim.tick(1 / 60);
  assert.deepEqual(sim.result, { cleared: false, shots: 1, stars: 0 });
  assert.equal(sim.grab(1000), false, 'no shots left');
});

test('stars: par gives three, one over gives two, more gives one', () => {
  assert.deepEqual([starsFor(1, 1), starsFor(2, 1), starsFor(3, 1), starsFor(2, 2)], [3, 2, 1, 3]);
});

test('playing the same shots again gives the same board (no randomness in play)', () => {
  const a = replay(SHOT_BOARDS[2], [{ id: 1004, angle: rad(210), power: 0.6 }]);
  const b = new HitofudeSimulation(SHOT_BOARDS[2]);
  playShot(b, { id: 1004, angle: rad(210), power: 0.6 });
  assert.deepEqual(a.core.drops.map(d => [d.x, d.y, d.mass]), b.core.drops.map(d => [d.x, d.y, d.mass]));
});
