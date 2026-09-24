import assert from 'node:assert/strict';
import test from 'node:test';
import { contactAnchor, DropletRim, RIM_BUDGET, RIM_MODES, rimProfile, rotateRim, type RimCoefficients, type RimInput } from '../src/experiments/droplet-lab/rim-response';

const still: RimInput = { vx: 0, vy: 0, grabbed: false, wallImpulse: { x: 0, y: 0 } };
const peak = (c: RimCoefficients) => Math.max(...c.map(Math.abs));
const budget = (c: RimCoefficients) => RIM_MODES.reduce((sum, k, i) => sum + k * k * Math.hypot(c[i * 2], c[i * 2 + 1]), 0);

function run(rim: DropletRim, input: RimInput, seconds: number, fps = 60) {
  const trace: RimCoefficients[] = [];
  for (let i = 0; i < Math.round(seconds * fps); i++) trace.push(rim.update(input, 1 / fps).coefficients);
  return trace;
}

/** Signed curvature numerator of a polar curve; positive everywhere means convex. */
function convex(c: RimCoefficients) {
  const h = 1e-3;
  for (let i = 0; i < 720; i++) {
    const t = i / 720 * Math.PI * 2;
    const { r, dr } = rimProfile(c, t);
    const ddr = (rimProfile(c, t + h).dr - rimProfile(c, t - h).dr) / (2 * h);
    if (r * r + 2 * dr * dr - r * ddr <= 0) return false;
  }
  return true;
}

test('at rest the rim is a plain circle with no anchor', () => {
  const rim = new DropletRim();
  const snap = rim.update(still, 1 / 60);
  assert.deepEqual(snap.coefficients, [0, 0, 0, 0, 0, 0]);
  assert.equal(snap.anchor.weight, 0);
  assert.equal(rimProfile(snap.coefficients, 1.2).r, 1);
});

test('a left-wall hit dents the left side first, rings, and settles', () => {
  const rim = new DropletRim();
  // Simulation +x push: the wall was on the left (render angle π).
  rim.update({ ...still, wallImpulse: { x: 900, y: 0 } }, 1 / 60);
  const early = run(rim, still, 0.03);
  const left = rimProfile(early.at(-1)!, Math.PI).r;
  assert.ok(left < 0.985, `impact side should give way, r=${left}`);
  const trace = run(rim, still, 1.5);
  const signs = new Set(trace.slice(0, 30).map(c => Math.sign(rimProfile(c, Math.PI).r - 1)));
  assert.ok(signs.has(1) && signs.has(-1), 'it should ring past round, not just relax');
  assert.ok(peak(trace.at(-1)!) < 1e-3, 'ripples die out');
});

test('holding a drop against a wall anchors it but does not keep it shivering', () => {
  const rim = new DropletRim();
  const pressed = { ...still, grabbed: true, wallImpulse: { x: 140, y: 0 } };
  const trace = run(rim, pressed, 1.5);
  assert.ok(peak(trace[20]) > 1e-3, 'the first touch rings');
  assert.ok(peak(trace.at(-1)!) < 1e-3, 'continued pressure alone stays quiet');
  const snap = rim.snapshot;
  assert.ok(snap.anchor.weight > 0.99);
  assert.ok(Math.abs(snap.anchor.x + 1) < 1e-9 && Math.abs(snap.anchor.y) < 1e-9, 'anchor points at the left wall');
  const released = run(rim, still, 0.4);
  assert.ok(released.length && rim.snapshot.anchor.weight === 0, 'anchor fades after contact ends');
});

test('any pile of impacts keeps the outline convex within the budget', () => {
  const rim = new DropletRim();
  let seed = 7;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 400; i++) {
    if (i % 3 === 0) rim.excite(random() * Math.PI * 2, 0.2 * (random() - 0.3));
    const snap = rim.update({ ...still, wallImpulse: i % 5 ? { x: 0, y: 0 } : { x: (random() - .5) * 5000, y: (random() - .5) * 5000 } }, 1 / 60);
    assert.ok(budget(snap.coefficients) <= RIM_BUDGET + 1e-9);
    assert.ok(convex(snap.coefficients), `frame ${i} lost convexity`);
  }
});

test('the response is the same at 30 and 60 frames per second', () => {
  const a = new DropletRim(), b = new DropletRim();
  a.excite(0.4, 0.05); b.excite(0.4, 0.05);
  const at60 = run(a, still, 0.2, 60).at(-1)!;
  const at30 = run(b, still, 0.2, 30).at(-1)!;
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(at60[i] - at30[i]) < 1e-9, `coefficient ${i}`);
});

test('grab and release give small, bounded ripples; reduced motion clears them', () => {
  const rim = new DropletRim();
  rim.update({ ...still, grabbed: true, grabPoint: { x: 0.8, y: 0 } }, 1 / 60);
  const grabbed = run(rim, { ...still, grabbed: true }, 0.05);
  assert.ok(peak(grabbed.at(-1)!) > 1e-4 && peak(grabbed.at(-1)!) < 0.03);
  rim.update({ ...still, vx: 600, vy: 0 }, 1 / 60);
  assert.ok(peak(rim.update(still, 1 / 60).coefficients) < 0.05);
  assert.deepEqual(rim.update(still, 1 / 60, true).coefficients, [0, 0, 0, 0, 0, 0]);
  const centreGrab = new DropletRim();
  centreGrab.update({ ...still, grabbed: true, grabPoint: { x: 0.05, y: 0 } }, 1 / 60);
  assert.equal(peak(centreGrab.update({ ...still, grabbed: true }, 1 / 60).coefficients), 0, 'a centre touch has no side to dent');
});

test('rotating coefficients describes the same outline in a turned frame', () => {
  const c: RimCoefficients = [0.03, -0.01, 0.012, 0.004, -0.006, 0.002];
  const turned = rotateRim(c, 0.7);
  for (const theta of [0, 1, 2.5, 4]) {
    assert.ok(Math.abs(rimProfile(turned, theta - 0.7).r - rimProfile(c, theta).r) < 1e-12);
  }
});

test('the contact anchor closes exactly the squash gap on the contact side', () => {
  const toward = { x: -1, y: 0, weight: 1 };
  const squashed = contactAnchor(toward, 0.8, 0, 1.2);
  assert.ok(Math.abs(squashed.x + 0.2) < 1e-12 && squashed.y === 0, 'moves 0.2 radius toward the wall');
  const stretched = contactAnchor(toward, 1.1, 0, 0.9);
  assert.ok(stretched.x > 0, 'a drop longer than round is kept off the wall');
  assert.deepEqual(contactAnchor({ ...toward, weight: 0 }, 0.8, 0, 1.2), { x: 0, y: 0 });
  const diagonal = contactAnchor({ x: Math.SQRT1_2, y: Math.SQRT1_2, weight: 0.5 }, 0.9, 0, 0.9);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 0.05) < 1e-12);
});
