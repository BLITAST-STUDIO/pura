import assert from 'node:assert/strict';
import test from 'node:test';
import { DropletSurface, MAX_PRESS, MAX_SURFACE_BEND, volumeScales, type DropletSurfaceInput } from '../src/experiments/droplet-lab/surface-response';

const STEP = 1 / 60;
const resting: DropletSurfaceInput = { x: 200, y: 200, r: 80, grabbed: false, pointer: null };
const held: DropletSurfaceInput = { ...resting, grabbed: true, pointer: { x: 200, y: 200 } };
const pulled: DropletSurfaceInput = { ...held, pointer: { x: 260, y: 200 } };

function advance(surface: DropletSurface, input: DropletSurfaceInput, seconds: number, fps = 60): void {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) surface.update(input, 1 / fps);
}

test('touch compresses on the first frame, without a center-grab sideways jump or a sustained held pulse', () => {
  const surface = new DropletSurface();
  const first = surface.update(held, STEP);
  assert.ok(first.press > 0.02 && first.press <= MAX_PRESS, 'touch should be visible in the first 60 Hz frame');
  assert.equal(first.bendX, 0);
  assert.equal(first.bendY, 0);
  advance(surface, held, 0.5);
  assert.ok(surface.snapshot.press < 0.00005, 'a stationary hold must relax instead of repeating a touch pulse');
  advance(surface, resting, 2);
  assert.ok(surface.snapshot.press < 1e-12);
  assert.equal(surface.snapshot.bendX, 0);
  assert.equal(surface.snapshot.bendY, 0);
});

test('an edge touch affects its own side briefly, while a center touch remains symmetric', () => {
  const left = new DropletSurface();
  const right = new DropletSurface();
  const a = left.update({ ...held, grabPoint: { x: -0.8, y: 0.3 } }, STEP);
  const b = right.update({ ...held, grabPoint: { x: 0.8, y: 0.3 } }, STEP);
  assert.ok(a.bendX < -0.004 && a.bendY > 0);
  assert.equal(a.bendX, -b.bendX);
  assert.equal(a.bendY, b.bendY);
  assert.equal(a.press, b.press, 'edge position should not change the touch compression');
  advance(left, { ...held, grabPoint: { x: -0.8, y: 0.3 } }, 0.6);
  assert.ok(Math.hypot(left.snapshot.bendX, left.snapshot.bendY) < 1e-6, 'edge displacement must not remain while held');
});

test('the upper surface responds promptly to the finger gap and preserves world direction without editing physics', () => {
  const surface = new DropletSurface();
  const input = { ...pulled, pointer: { x: 260, y: 140 }, vx: -500, vy: 900, mass: 6400 };
  const before = structuredClone(input);
  const first = surface.update(input, STEP);
  assert.ok(Math.hypot(first.bendX, first.bendY) > MAX_SURFACE_BEND * 0.55, 'surface response should appear before the body can catch the finger');
  assert.ok(first.bendX > 0 && first.bendY > 0, 'an upper-right finger bends toward upper-right in rendering coordinates');
  assert.equal(first.bendX, first.bendY);
  assert.deepEqual(input, before);
  const alternateVelocity = new DropletSurface().update({ ...input, vx: 500, vy: -900 } as typeof input, STEP);
  assert.deepEqual(alternateVelocity, first, 'surface response must not add a second velocity response');
});

test('catching the finger and releasing remove the bend; reversing stays bounded and follows the new side', () => {
  const surface = new DropletSurface();
  advance(surface, pulled, 0.2);
  assert.ok(surface.snapshot.bendX > 0.06);
  const reversed = surface.update({ ...pulled, pointer: { x: 140, y: 200 } }, 1 / 120);
  assert.ok(reversed.bendX > 0 && reversed.bendX < 0.06, 'a reversal first removes the existing bend rather than jumping between full extremes');
  advance(surface, { ...pulled, pointer: { x: 140, y: 200 } }, 0.1);
  assert.ok(surface.snapshot.bendX < -0.06);
  advance(surface, held, 0.5);
  assert.ok(Math.abs(surface.snapshot.bendX) < 0.0002, 'catching a held finger should release the bend');
  advance(surface, pulled, 0.2);
  const prior = surface.snapshot.bendX;
  const release = surface.update(resting, STEP);
  assert.ok(release.bendX > 0 && release.bendX < prior, 'release must recover continuously');
  advance(surface, resting, 0.8);
  assert.ok(Math.abs(surface.snapshot.bendX) < 0.00001);
});

test('extreme gaps and edge anchors cannot exceed the shared bend and compression envelope', () => {
  const surface = new DropletSurface();
  for (let frame = 0; frame < 300; frame++) {
    const angle = frame * 0.15;
    const state = surface.update({
      ...held, grabbed: frame % 3 !== 0,
      pointer: { x: 1e9 * Math.cos(angle), y: 1e9 * Math.sin(angle) },
      grabPoint: { x: 1e8, y: -1e8 },
    }, 1 / 15);
    assert.ok(Number.isFinite(state.bendX) && Number.isFinite(state.bendY) && Number.isFinite(state.press));
    assert.ok(Math.hypot(state.bendX, state.bendY) <= MAX_SURFACE_BEND + 1e-15);
    assert.ok(state.press >= 0 && state.press <= MAX_PRESS);
  }
});

test('surface timing agrees at 15–120 Hz through touch, pulling, reversal, catch-up and release', () => {
  function trace(fps: number): number[] {
    const surface = new DropletSurface();
    const values: number[] = [];
    for (const input of [
      { ...held, grabPoint: { x: -0.7, y: 0.2 } }, pulled,
      { ...pulled, pointer: { x: 140, y: 230 } }, held, resting,
      { ...held, grabPoint: { x: 0.5, y: -0.5 } }, resting,
    ]) {
      advance(surface, input, 1 / 3, fps);
      values.push(surface.snapshot.bendX, surface.snapshot.bendY, surface.snapshot.press);
    }
    return values;
  }
  const reference = trace(120);
  for (const fps of [15, 24, 30, 60]) {
    const values = trace(fps);
    const error = Math.max(...values.map((value, index) => Math.abs(value - reference[index])));
    assert.ok(error < 1e-12, `${fps} Hz must retain elapsed-time response; error ${error}`);
  }
});

test('all allowed wobble, wall squash and touch compression scales conserve volume and remain positive', () => {
  for (let stretchStep = 0; stretchStep <= 26; stretchStep++) {
    const stretch = -0.26 + stretchStep * 0.02;
    for (let squashStep = 0; squashStep <= 10; squashStep++) {
      const squash = squashStep * 0.025;
      for (const press of [0, MAX_PRESS * 0.5, MAX_PRESS]) {
        const scale = volumeScales(stretch, squash, press);
        assert.ok(scale.x > 0 && scale.y > 0 && scale.z > 0);
        assert.ok(Math.abs(scale.x * scale.y * scale.z - 1) < 1e-12, 'changing shape must not inflate or erase material');
        assert.ok(Math.abs(scale.x / scale.y - (1 + stretch) / (1 - stretch * 0.46 + squash)) < 1e-12, 'touch must preserve the established XY wobble proportions');
      }
    }
  }
  assert.deepEqual(volumeScales(0, 0, 0), { x: 1, y: 1, z: 1 });
  const compressed = volumeScales(0, 0.25, MAX_PRESS);
  assert.ok(compressed.y > 1 && compressed.z < 0.8, 'spreading and touch pressure should visibly reduce height');
  for (const values of [[-99, 99, 99], [99, -99, -99], [NaN, Infinity, -Infinity]]) {
    const scale = volumeScales(values[0], values[1], values[2]);
    assert.ok(Object.values(scale).every(value => Number.isFinite(value) && value > 0));
    assert.ok(Math.abs(scale.x * scale.y * scale.z - 1) < 1e-12);
  }
});

test('reset, reduced motion, invalid input and suspension do not retain or replay hidden touch impulses', () => {
  const surface = new DropletSurface();
  advance(surface, pulled, 0.1);
  const prior = surface.snapshot;
  for (const dt of [0, -1, NaN, Infinity]) surface.update(resting, dt);
  assert.deepEqual(surface.snapshot, prior);
  assert.deepEqual(surface.update(held, 0, true), { bendX: 0, bendY: 0, press: 0 });
  assert.deepEqual(surface.update(held, STEP), { bendX: 0, bendY: 0, press: 0 }, 're-enabling while held should not synthesize a new touch');
  surface.update(resting, STEP);
  assert.ok(surface.update(held, STEP).press > 0.02, 'a genuinely new touch should still respond');
  surface.reset();
  assert.deepEqual(surface.snapshot, { bendX: 0, bendY: 0, press: 0 });
  const external = surface.snapshot;
  external.bendX = external.press = 100;
  assert.equal(surface.snapshot.press, 0);
  assert.deepEqual(surface.update(pulled, 100), new DropletSurface().update(pulled, 1 / 12));
  advance(surface, { ...pulled, r: NaN, grabPoint: { x: NaN, y: Infinity } }, 1);
  assert.ok(Math.hypot(surface.snapshot.bendX, surface.snapshot.bendY) < 1e-6, 'invalid geometry should recover safely');
});
