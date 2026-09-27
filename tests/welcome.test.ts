import assert from 'node:assert/strict';
import test from 'node:test';
import { WELCOME_STEPS, welcomed, WELCOMED_KEY } from '../src/experiments/welcome/steps';
import { MichiSimulation } from '../src/experiments/michi/simulation';
import { dominantHue } from '../src/game/palette';
import { HitofudeSimulation } from '../src/experiments/hitofude/simulation';
import { pullGhost } from '../src/experiments/ghost-touch-logic';
import { replay } from '../scripts/hitofude-solve';

const settle = (sim: MichiSimulation, seconds: number) => { for (let t = 0; t < seconds && !sim.won; t += 1 / 60) sim.tick(1 / 60); };

test('every welcome board waits for a touch: nothing fuses on its own', () => {
  for (const step of WELCOME_STEPS.filter(s => !s.shot)) {
    const sim = new MichiSimulation(step.board, 'legacy');
    settle(sim, 3);
    assert.equal(sim.core.drops.length, step.board.layout!.length, `step ${step.id}`);
    // Step 0's one drop is trivially 'gathered'; that step waits for a touch instead.
    if (step.id > 0) assert.equal(sim.won, null, `step ${step.id} is not done before play`);
  }
});

test('each goal is met by bringing each colour together, and the pictures match the boards', () => {
  for (const step of WELCOME_STEPS.slice(1).filter(s => !s.shot)) {
    const sim = new MichiSimulation(step.board, 'legacy');
    const counts = new Map<string, number>();
    for (const d of step.board.layout!) counts.set(d.hue, (counts.get(d.hue) ?? 0) + 1);
    assert.deepEqual(step.picture.map(p => [p.hue, p.from]), [...counts.entries()], `step ${step.id} picture`);
    const spots: Record<string, [number, number]> = { cyan: [120, 200], rose: [300, 200], amber: [210, 400] };
    for (const d of sim.core.drops) { const [x, y] = spots[dominantHue(d.pigment)]; d.x = x; d.y = y; }
    settle(sim, 2);
    assert.ok(sim.won, `step ${step.id} is completed`);
  }
});

test('the first step counts a touch; the welcome is remembered once seen', () => {
  const sim = new MichiSimulation(WELCOME_STEPS[0].board, 'legacy');
  sim.grab(sim.core.drops[0].id); sim.release();
  assert.equal(sim.touches, 1);
  assert.equal(welcomed({ getItem: () => null }), false);
  assert.equal(welcomed({ getItem: k => (k === WELCOMED_KEY ? '1' : null) }), true);
  assert.equal(welcomed(null), false);
  assert.equal(welcomed({ getItem: () => { throw Error('blocked'); } }), true, 'no storage: do not force it every time');
});

test('the last step is a shot: pulled from anywhere, the drop by the left edge clears it in one', () => {
  const step = WELCOME_STEPS[WELCOME_STEPS.length - 1];
  assert.equal(step.ghost, 'pull');
  const board = step.shot!;
  assert.deepEqual(step.picture.map(p => [p.hue, p.from]), [['cyan', board.drops.length]], 'the picture matches the shot board');
  const idle = new HitofudeSimulation(board);
  for (let t = 0; t < 3; t += 1 / 60) idle.tick(1 / 60);
  assert.equal(idle.result, null, 'nothing happens before a pull');
  assert.equal(idle.selected(), idle.core.drops[0].id, 'the big drop by the edge is the one aimed');
  assert.ok(board.drops[0].x < 100, 'the aimed drop sits near the wall, where a pull from the drop itself runs out of room');
  // ひとふで's first hole, moved left: the same shot up and to the right gathers all five.
  const sim = replay(board, [{ id: 1000, angle: 300 * Math.PI / 180, power: 0.8 }]);
  assert.deepEqual(sim.result, { cleared: true, shots: 1 });
});

test('the pull ghost lands on open floor and draws back away from the other drops', () => {
  const area = { w: 390, h: 760 };
  const ghost = pullGhost({ x: 60, y: 600 }, [{ x: 150, y: 400 }, { x: 200, y: 250 }], area);
  assert.equal(ghost.kind, 'pull');
  assert.ok(ghost.x0 > area.w / 2, 'the finger starts on the far half from the drop');
  assert.ok(ghost.x1 < ghost.x0 && ghost.y1 > ghost.y0, 'it draws back down and left, so the drop flies up and right');
  if (ghost.kind === 'pull') assert.deepEqual([ghost.dropX, ghost.dropY], [60, 600], 'the dashed link ends on the drop');
});
