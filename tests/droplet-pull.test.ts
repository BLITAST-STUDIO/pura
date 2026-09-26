import assert from 'node:assert/strict';
import test from 'node:test';
import { DropletPull, type DropletPullInput } from '../src/experiments/droplet-lab/pull-response';
import { DropletSimulation } from '../src/experiments/droplet-lab/simulation';

const STEP = 1 / 60;
const held: DropletPullInput = { x: 200, y: 200, r: 80, grabbed: true, pointer: { x: 260, y: 200 } };

function advance(pull: DropletPull, input: DropletPullInput, seconds: number, fps = 60): void {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) pull.update(input, 1 / fps);
}

test('the leading edge follows the finger gap, independent of velocity, without changing physics', () => {
  const pull = new DropletPull();
  const input = { ...held, pointer: { x: 248, y: 152 }, vx: -900, vy: 900, mass: 6400 };
  const original = structuredClone(input);
  const initial = pull.update(input, STEP);
  assert.ok(initial.x > 0 && initial.y > 0, 'an upper-right finger pulls the upper-right world edge');
  assert.ok(Math.abs(initial.x - initial.y) < 1e-12);
  const otherVelocity = new DropletPull();
  assert.deepEqual(otherVelocity.update({ ...input, vx: 900, vy: -900 } as typeof input, STEP), initial);
  advance(pull, input, 0.15);
  assert.ok(pull.snapshot.strength > 0.23, 'the surface should get ahead promptly');
  assert.deepEqual(input, original, 'presentation must not edit the body or throw velocity');
});

test('the real body gains momentum behind the pulled edge, then catches a stationary finger and relaxes', () => {
  const simulation = new DropletSimulation({ radius: 88 });
  const pull = new DropletPull();
  const start = simulation.snapshot;
  const targetX = start.x + start.r * 0.8;
  assert.equal(simulation.pointerDown(start.x, start.y), true);
  simulation.pointerMove(targetX, start.y);

  const trace: { x: number; vx: number; gap: number; strength: number }[] = [];
  for (let frame = 0; frame < 120; frame++) {
    simulation.tick(STEP);
    const body = simulation.snapshot;
    const shape = pull.update(body, STEP);
    trace.push({ x: body.x, vx: body.vx, gap: targetX - body.x, strength: shape.strength });
    assert.equal(body.grabbed, true);
    assert.equal(body.mass, start.mass);
  }

  const early = trace[2]; // Fifty milliseconds after the finger moves.
  assert.ok(early.gap > start.r * 0.6, 'the body should still visibly lag behind the finger');
  assert.ok(early.strength > 0.1, 'the leading surface should already stretch toward the finger');
  assert.ok(early.strength > (early.x - start.x) / start.r * 2, 'surface response should lead the bulk movement');
  for (let frame = 1; frame < 6; frame++) {
    assert.ok(trace[frame].vx > trace[frame - 1].vx, 'the following body should gain momentum over its first frames');
  }
  assert.ok(trace[29].gap < trace[8].gap / 3, 'the body should close the finger gap');
  assert.ok(trace[29].strength < trace[8].strength / 3, 'catching up should reduce the surface pull');
  assert.ok(Math.abs(trace.at(-1)!.gap) < start.r * 0.01, 'a held stationary finger should settle the body');
  assert.ok(trace.at(-1)!.strength < 0.001, 'settling must not leave a stretched surface');
});

test('the pull disappears as the body catches the finger, including while held', () => {
  const pull = new DropletPull();
  advance(pull, held, 0.3);
  const stretched = pull.snapshot.strength;
  assert.ok(stretched > 0.23);
  const nearer = { ...held, x: 244 };
  advance(pull, nearer, 0.15);
  assert.ok(pull.snapshot.strength < stretched / 3, 'a smaller gap should loosen the surface');
  advance(pull, { ...held, x: 260 }, 0.2);
  assert.ok(pull.snapshot.strength < 0.004, 'no frozen extension when the held body has caught up');
  const deadZone = new DropletPull();
  advance(deadZone, { ...held, pointer: { x: 201, y: 201 } }, 0.5);
  assert.deepEqual(deadZone.snapshot, { x: 0, y: 0, strength: 0 });
});

test('a sudden reversal passes smoothly through the existing pull before following the other side', () => {
  const pull = new DropletPull();
  advance(pull, held, 0.3);
  const right = pull.snapshot.x;
  const reversed = { ...held, pointer: { x: 140, y: 200 } };
  const first = pull.update(reversed, STEP);
  assert.ok(first.x > 0 && first.x < right, 'the first frame should shorten the old edge, not flip it');
  advance(pull, reversed, 0.1);
  assert.ok(pull.snapshot.x < -0.2, 'the edge should then follow the new finger direction');
});

test('release recovers promptly and sustained travel cannot hold the leading edge out', () => {
  const pull = new DropletPull();
  advance(pull, held, 0.3);
  const release = { ...held, grabbed: false, vx: 1000, vy: 0 };
  const initial = pull.snapshot.strength;
  const first = pull.update(release, STEP).strength;
  assert.ok(first > 0 && first < initial, 'release should recover continuously');
  advance(pull, release, 0.2);
  assert.ok(pull.snapshot.strength < 0.009, 'leading-edge recovery should finish within about 200 ms');
  advance(pull, release, 1);
  assert.ok(pull.snapshot.strength < 1e-8, 'free travel must not sustain a pull');
  advance(pull, held, 0.1);
  advance(pull, { ...held, pointer: null }, 0.2);
  assert.ok(pull.snapshot.strength < 0.01, 'missing pointer must release the visual edge too');
});

test('extreme gaps stay bounded and equal relative gaps have equal responses across drop sizes', () => {
  const pull = new DropletPull();
  for (let frame = 0; frame < 300; frame++) {
    const snap = pull.update({ ...held, pointer: { x: 1e9 * Math.cos(frame), y: 1e9 * Math.sin(frame) } }, 1 / 15);
    assert.ok(Number.isFinite(snap.x) && Number.isFinite(snap.y));
    assert.ok(snap.strength <= 0.24 + Number.EPSILON);
    assert.equal(snap.strength, Math.hypot(snap.x, snap.y));
  }
  const small = new DropletPull();
  const large = new DropletPull();
  const smallInput = { ...held, r: 40, pointer: { x: 220, y: 190 } };
  const largeInput = { ...held, r: 160, pointer: { x: 280, y: 160 } };
  advance(small, smallInput, 0.2);
  advance(large, largeInput, 0.2);
  assert.deepEqual(small.snapshot, large.snapshot);
});

test('15–120 Hz agree at shared elapsed times through pull, reversal, catch-up and release', () => {
  function trace(fps: number): number[] {
    const pull = new DropletPull();
    const samples: number[] = [];
    for (const input of [held, { ...held, pointer: { x: 140, y: 160 } }, { ...held, x: 260 }, { ...held, grabbed: false }]) {
      advance(pull, input, 1 / 3, fps);
      samples.push(pull.snapshot.x, pull.snapshot.y, pull.snapshot.strength);
    }
    return samples;
  }
  const reference = trace(120);
  for (const fps of [15, 24, 30, 60]) {
    const samples = trace(fps);
    const error = Math.max(...samples.map((sample, index) => Math.abs(sample - reference[index])));
    assert.ok(error < 1e-12, `${fps} Hz should preserve elapsed-time response; error ${error}`);
  }
});

test('reset, reduced motion, invalid time and suspension cannot retain hidden visual pull', () => {
  const pull = new DropletPull();
  advance(pull, held, 0.1);
  const before = pull.snapshot;
  for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) pull.update(held, dt);
  assert.deepEqual(pull.snapshot, before);
  assert.deepEqual(pull.update(held, 0, true), { x: 0, y: 0, strength: 0 });
  const enabled = pull.update(held, STEP);
  assert.deepEqual(enabled, new DropletPull().update(held, STEP), 're-enabling starts fresh');
  pull.reset();
  assert.deepEqual(pull.snapshot, { x: 0, y: 0, strength: 0 });
  const external = pull.snapshot;
  external.x = external.y = external.strength = 999;
  assert.equal(pull.snapshot.strength, 0);
  assert.deepEqual(pull.update(held, 100), new DropletPull().update(held, 1 / 12));
  advance(pull, { ...held, r: Number.NaN }, 0.5);
  assert.ok(pull.snapshot.strength < 0.001, 'invalid geometry input should recover safely');
});
