import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_TUNING } from '../src/game/sim';
import { FREE_DEFAULTS, FREE_PRESETS, FreeSimulation, normalizeFree, tuningFor } from '../src/experiments/free/simulation';

/** Flick one drop alone on the board and measure how far it slides. */
function glide(settings: Parameters<typeof normalizeFree>[0]) {
  const s = new FreeSimulation({ ...settings, count: 6, colors: 1 });
  const d = s.core.drops[0];
  s.core.drops = [d];
  // Slow enough that no setting reaches the far wall in one second.
  d.x = 60; d.y = 280; d.vx = 150; d.vy = 0;
  let t = 0;
  for (; t < 60 && Math.hypot(d.vx, d.vy) > 1; t++) s.tick(1 / 60);
  return { distance: d.x - 60, seconds: t / 60, speed: Math.hypot(d.vx, d.vy) };
}

test('the standard preset is the legacy feel', () => {
  const t = tuningFor(normalizeFree({ ...FREE_DEFAULTS, ...FREE_PRESETS.standard }));
  assert.ok(Math.abs(t.damp - LEGACY_TUNING.damp) < 0.0005);
  assert.ok(Math.abs(t.grabK - LEGACY_TUNING.grabK) < 2);
  assert.ok(Math.abs(t.grabDamp - LEGACY_TUNING.grabDamp) < 0.5);
  assert.equal(t.friction, 0);
  assert.equal(t.attraction, 1);
});

test('viscosity and friction shorten a glide; friction brings it to rest', () => {
  const watery = glide({ viscosity: 0 }), syrupy = glide({ viscosity: 1 }), rough = glide({ viscosity: 0, friction: 1 });
  assert.ok(watery.distance > syrupy.distance * 1.5, `${watery.distance} vs ${syrupy.distance}`);
  assert.ok(watery.speed > syrupy.speed * 5);
  assert.ok(rough.distance < watery.distance);
  assert.ok(rough.seconds < 1, 'friction stops it within a second');
});

test('inertia makes a held drop lag behind the finger', () => {
  const lag = (inertia: number) => {
    const s = new FreeSimulation({ count: 6, colors: 1, inertia });
    const d = s.core.drops[0]; s.core.drops = [d]; d.x = 100; d.y = 280;
    s.grab(d.id); s.move(300, 280);
    for (let i = 0; i < 12; i++) s.tick(1 / 60);
    return 300 - d.x;
  };
  assert.ok(lag(1) > lag(0) + 20);
});

test('colours, count and mixing rule follow the settings; feel changes live', () => {
  const one = new FreeSimulation({ count: 24, colors: 1 });
  assert.equal(one.core.drops.length, 24);
  assert.ok(one.core.drops.every(d => d.pigment.cyan > 0));
  const two = new FreeSimulation({ count: 24, colors: 2 });
  assert.equal(two.core.drops.filter(d => d.pigment.rose > 0).length, 12);
  assert.equal(new FreeSimulation({ mix: 'all' }).core.fusionPolicy, 'all-colors');
  assert.equal(new FreeSimulation({ mix: 'same' }).core.fusionPolicy, 'legacy');
  const s = new FreeSimulation({ count: 36 });
  const before = s.core.drops.map(d => [d.x, d.y]);
  s.configure({ viscosity: 1, mix: 'all' });
  assert.equal(s.core.fusionPolicy, 'all-colors');
  assert.ok(s.core.tuning.damp < 0.975);
  assert.deepEqual(s.core.drops.map(d => [d.x, d.y]), before, 'feel changes do not re-deal the board');
  assert.deepEqual(normalizeFree({ count: 999, colors: 7 as 1, viscosity: -3 }), { ...normalizeFree({}), count: 60, colors: 3, viscosity: 0 });
});

test('nothing fuses before a touch, even with double attraction', () => {
  for (const colors of [1, 2, 3] as const) {
    const s = new FreeSimulation({ count: 60, colors, attraction: 2 });
    const n = s.core.drops.length;
    for (let i = 0; i < 300; i++) s.tick(1 / 60);
    assert.equal(s.core.drops.length, n, `${colors} colours`);
  }
});
