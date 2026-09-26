import assert from 'node:assert/strict';
import test from 'node:test';
import { DropletMotion, type DropletMotionInput } from '../src/experiments/droplet-lab/motion';

const STEP = 1 / 60;
const still: DropletMotionInput = { vx: 0, vy: 0, grabbed: false, wallImpulse: { x: 0, y: 0 } };
const moving: DropletMotionInput = { ...still, vx: 700 };

function advance(motion: DropletMotion, input: DropletMotionInput, seconds: number, fps = 60): number[] {
  const trace: number[] = [];
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    trace.push(motion.update(input, 1 / fps).stretch);
  }
  return trace;
}

test('a start stretches, recovers across round, and settles instead of holding an ellipse', () => {
  const motion = new DropletMotion();
  const trace = advance(motion, moving, 2);
  assert.ok(Math.max(...trace.slice(0, 12)) > 0.09, 'starting should visibly stretch');
  assert.ok(Math.min(...trace.slice(8, 30)) < -0.025, 'recovery should widen past round');
  assert.ok(Math.max(...trace.slice(18, 45)) > 0.035, 'the next smaller rebound should be visible');
  assert.ok(Math.abs(trace.at(-1)!) < 0.03, 'a steady glide should return nearly round');
  const tail = advance(motion, moving, 1);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 0.001, 'a steady glide should not wobble forever');
});

test('release and stopping excite an alternating recovery without changing physics input', () => {
  const motion = new DropletMotion();
  const held = { ...moving, grabbed: true };
  advance(motion, held, 1.5);
  const input = structuredClone(moving);
  const original = structuredClone(input);
  const trace = advance(motion, input, 0.8);
  assert.ok(Math.min(...trace.slice(0, 12)) < -0.025, 'release should contract along travel');
  assert.ok(Math.max(...trace.slice(10, 30)) > 0.04, 'release should rebound');
  assert.deepEqual(input, original, 'the visual response must not add a throw or edit mass/input');
  const stopTrace = advance(motion, still, 2);
  assert.ok(Math.min(...stopTrace.slice(0, 12)) < -0.09);
  assert.ok(Math.max(...stopTrace.slice(8, 30)) > 0.025);
  assert.ok(Math.abs(motion.snapshot.stretch) < 0.001, 'stopped drop should settle');
});

test('a wall impact compresses and rebounds within the safe silhouette envelope', () => {
  const motion = new DropletMotion();
  advance(motion, moving, 1.5);
  const impact = motion.update({ ...moving, vx: -560, wallImpulse: { x: -1260, y: 0 } }, STEP);
  assert.ok(impact.squash > 0.1);
  assert.ok(impact.stretch < 0);
  const trace = advance(motion, { ...moving, vx: -560 }, 2);
  assert.ok(Math.min(...trace.slice(0, 12)) < -0.1, 'wall impact should flatten');
  assert.ok(Math.max(...trace.slice(8, 30)) > 0.06, 'wall impact should overshoot');
  assert.ok(Math.abs(motion.snapshot.stretch) < 0.03);
  assert.ok(motion.snapshot.squash < 0.001);
  assert.ok(Math.abs(motion.snapshot.angle) < 0.01, 'reversal should not spin the shape half a turn');
  for (let frame = 0; frame < 600; frame++) {
    const snap = motion.update({ ...moving, vx: frame % 2 ? 10000 : -10000, wallImpulse: { x: frame % 2 ? 20000 : -20000, y: 20000 } }, 1 / 15);
    assert.ok(snap.stretch >= -0.26 && snap.stretch <= 0.26);
    assert.ok(snap.squash >= 0 && snap.squash <= 0.25);
    assert.ok(Number.isFinite(snap.angle));
  }
});

test('ordinary frame rates give comparable recovery and settle at the same elapsed time', () => {
  function run(fps: number) {
    const motion = new DropletMotion();
    const samples: number[] = [];
    // A ramp, release, coast and stop sampled at shared wall-clock boundaries.
    for (let frame = 1; frame <= fps * 2; frame++) {
      const time = frame / fps;
      const vx = time <= 0.4 ? time * 1800 : time <= 0.8 ? 720 : 720 * Math.max(0, 1 - (time - 0.8) / 0.4);
      const snap = motion.update({ ...still, vx, grabbed: time <= 0.4 }, 1 / fps);
      if (frame % (fps / 5) === 0) samples.push(snap.stretch);
    }
    return samples;
  }
  const reference = run(120);
  for (const fps of [15, 30, 60]) {
    const trace = run(fps);
    assert.equal(trace.length, reference.length);
    const error = Math.max(...trace.map((sample, index) => Math.abs(sample - reference[index])));
    assert.ok(error < 0.026, `${fps} Hz differs by ${error.toFixed(4)}`);
    assert.ok(Math.abs(trace.at(-1)!) < 0.01);
  }
});

test('reset, reduced motion, pauses and long frames do not retain or replay visual energy', () => {
  const motion = new DropletMotion();
  advance(motion, { ...moving, grabbed: true }, 0.1);
  const paused = motion.snapshot;
  motion.update(still, 0);
  motion.update(still, Number.NaN);
  assert.deepEqual(motion.snapshot, paused);
  assert.deepEqual(motion.update(moving, 0, true), { stretch: 0, squash: 0, angle: 0 });
  const enabled = motion.update(moving, STEP);
  assert.ok(Math.abs(enabled.stretch) < 0.002, 'enabling motion must not replay the suppressed release');
  motion.reset();
  assert.deepEqual(motion.snapshot, { stretch: 0, squash: 0, angle: 0 });
  const external = motion.snapshot;
  external.stretch = 999;
  assert.equal(motion.snapshot.stretch, 0);
  const capped = new DropletMotion();
  assert.deepEqual(motion.update(moving, 100), capped.update(moving, 1 / 12));
  advance(motion, still, 3);
  assert.ok(Math.abs(motion.snapshot.stretch) < 0.0001);
});
