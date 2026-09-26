import assert from 'node:assert/strict';
import test from 'node:test';
import { AIMABLE_SPEED, HitofudeSimulation, launch, MAX_PULL, MIN_PULL, SHOT_SPEED, shotLimit, type ShotBoard } from '../src/experiments/hitofude/simulation';
import { holeStrokes, relative, Round, scoreName, totals } from '../src/experiments/hitofude/golf';
import { SHOT_BOARDS } from '../src/experiments/hitofude/boards';
import { playShot, replay, type Shot } from '../scripts/hitofude-solve';

const rad = (deg: number) => deg * Math.PI / 180;
/** Minimum solutions found by scripts/hitofude-solve.ts, from the middle of their working ranges. */
const MIN_SOLUTIONS: Record<number, Shot[]> = {
  1: [{ id: 1000, angle: rad(300), power: 0.8 }],
  2: [{ id: 1000, angle: rad(325), power: 0.9 }],
  // Rose first along its diagonal (it holds the crossing), then the cyan diagonal is open.
  3: [{ id: 1004, angle: rad(238), power: 0.8 }, { id: 1000, angle: rad(300), power: 0.8 }],
  4: [{ id: 1000, angle: rad(223), power: 0.95 }],
  5: [{ id: 1000, angle: rad(269), power: 0.8 }],
  6: [{ id: 1003, angle: rad(147), power: 0.8 }, { id: 2, angle: rad(358), power: 1 }],
  // A combination shot found by the search (drop 2 is the gathered amber).
  7: [{ id: 1004, angle: rad(31), power: 1 }, { id: 2, angle: rad(192), power: 1 }],
  8: [{ id: 1000, angle: rad(214), power: 0.8 }, { id: 4, angle: rad(332), power: 1 }],
  9: [{ id: 1000, angle: rad(288), power: 0.8 }],
};

test('every hole can be finished in its recorded minimum, and par is above it', () => {
  for (const board of SHOT_BOARDS) {
    const solution = MIN_SOLUTIONS[board.id];
    if (!solution) continue;
    assert.equal(solution.length, board.min, `${board.name}: the recorded solution uses the minimum`);
    assert.ok(board.par > board.min, `${board.name}: finishing in the minimum is under par`);
    const sim = replay(board, solution);
    assert.deepEqual(sim.result, { cleared: true, shots: board.min }, board.name);
    assert.equal(sim.core.drops.length, new Set(board.drops.map(d => d.hue)).size, 'one drop per colour');
  }
  assert.equal(SHOT_BOARDS.length, 9, 'a nine-hole course');
});

test('hole 7 in order makes par: amber first, then cyan gently, then rose', () => {
  const sim = replay(SHOT_BOARDS[6], [{ id: 1004, angle: rad(38.4), power: 0.7 }, { id: 1000, angle: rad(270), power: 0.5 }, { id: 1002, angle: rad(321.6), power: 0.8 }]);
  assert.deepEqual(sim.result, { cleared: true, shots: SHOT_BOARDS[6].par });
});

test('hole 7: a cyan shot that is too strong rebounds into the centre and blocks the rose', () => {
  const sim = replay(SHOT_BOARDS[6], [{ id: 1004, angle: rad(38.4), power: 0.7 }, { id: 1000, angle: rad(270), power: 1 }]);
  const cyan = sim.core.drops.find(d => d.pigment.cyan > 0)!;
  assert.ok(Math.abs(cyan.x - 210) < 10 && Math.abs(cyan.y - 295) < 60, `cyan rests near the centre (${cyan.x.toFixed(0)}, ${cyan.y.toFixed(0)})`);
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

const pair: ShotBoard = { id: 99, code: '99', name: 'test', hint: '', par: 1, min: 1, drops: [
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

test('a sliding drop cannot be caught, and the hole ends when strokes run out', () => {
  const sim = new HitofudeSimulation(pair);
  sim.grab(1001); sim.move(320, 300); sim.release();
  const sliding = sim.core.drops.find(d => d.id === 1001)!;
  sim.tick(1 / 60);
  assert.ok(Math.hypot(sliding.vx, sliding.vy) > AIMABLE_SPEED);
  assert.equal(sim.grab(1001), false, 'no catching a drop in flight');
  // Use up the strokes nudging the other drop down, away from its pair.
  for (let n = 1; n < shotLimit(pair.par); n++) {
    for (let t = 0; t < 12 && !sim.atRest; t += 1 / 60) sim.tick(1 / 60);
    playShot(sim, { id: 1000, angle: rad(90), power: 0.2 });
  }
  for (let t = 0; t < 20 && !sim.result; t += 1 / 60) sim.tick(1 / 60);
  assert.deepEqual(sim.result, { cleared: false, shots: shotLimit(pair.par) });
  assert.equal(holeStrokes(sim.result!, pair.par), pair.par + 4, 'picked up at par + 4');
  assert.equal(sim.grab(1000), false, 'no strokes left');
});

test('golf scoring: names, signs, totals and a round played in order', () => {
  assert.deepEqual([scoreName(1, 3), scoreName(2, 3), scoreName(3, 3), scoreName(4, 3), scoreName(8, 3)], ['ひとふで', 'バーディー', 'パー', 'ボギー', '+5']);
  assert.deepEqual([relative(-2), relative(0), relative(3)], ['−2', '±0', '+3']);
  assert.deepEqual(totals([2, null, 4], [2, 3, 3]), { strokes: 6, par: 5, diff: 1, holes: 2 });
  const round = new Round([2, 3]);
  round.record(1);
  assert.equal(round.hole, 1);
  round.record(3); round.record(9);
  assert.ok(round.finished);
  assert.deepEqual(round.card, [1, 3], 'nothing is recorded past the last hole');
  assert.equal(round.totals.diff, -1);
});

test('playing the same shots again gives the same board (no randomness in play)', () => {
  const a = replay(SHOT_BOARDS[2], [{ id: 1004, angle: rad(210), power: 0.6 }]);
  const b = new HitofudeSimulation(SHOT_BOARDS[2]);
  playShot(b, { id: 1004, angle: rad(210), power: 0.6 });
  assert.deepEqual(a.core.drops.map(d => [d.x, d.y, d.mass]), b.core.drops.map(d => [d.x, d.y, d.mass]));
});
