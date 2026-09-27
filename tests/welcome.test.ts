import assert from 'node:assert/strict';
import test from 'node:test';
import { WELCOME_STEPS, welcomed, WELCOMED_KEY } from '../src/experiments/welcome/steps';
import { MichiSimulation } from '../src/experiments/michi/simulation';
import { dominantHue } from '../src/game/palette';

const settle = (sim: MichiSimulation, seconds: number) => { for (let t = 0; t < seconds && !sim.won; t += 1 / 60) sim.tick(1 / 60); };

test('every welcome board waits for a touch: nothing fuses on its own', () => {
  for (const step of WELCOME_STEPS) {
    const sim = new MichiSimulation(step.board, 'legacy');
    settle(sim, 3);
    assert.equal(sim.core.drops.length, step.board.layout!.length, `step ${step.id}`);
    // Step 0's one drop is trivially 'gathered'; that step waits for a touch instead.
    if (step.id > 0) assert.equal(sim.won, null, `step ${step.id} is not done before play`);
  }
});

test('each goal is met by bringing each colour together, and the pictures match the boards', () => {
  for (const step of WELCOME_STEPS.slice(1)) {
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
