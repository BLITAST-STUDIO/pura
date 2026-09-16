import assert from "node:assert/strict";
import test from "node:test";
import { DropletSimulation } from "../src/experiments/droplet-lab/simulation";

const STEP = 1 / 60;

function advance(sim: DropletSimulation, frames: number): void {
  for (let frame = 0; frame < frames; frame++) sim.tick(STEP);
}

function movingDrop(): DropletSimulation {
  const sim = new DropletSimulation();
  assert.equal(sim.pointerDown(500, 325), true);
  sim.pointerMove(780, 325);
  advance(sim, 12);
  return sim;
}

test("the fixture stays one pure-color mass through color changes, taps and reset", (t) => {
  t.mock.method(Math, "random", () => {
    throw new Error("The one-drop fixture must not use random spawning.");
  });
  const sim = new DropletSimulation();
  const initial = sim.snapshot;
  assert.equal(sim.width, 1000);
  assert.equal(sim.height, 650);
  assert.equal(initial.x, 500);
  assert.equal(initial.y, 325);
  assert.equal(initial.r, 68);
  assert.equal(initial.mass, 68 * 68);
  for (const hue of ["rose", "amber", "cyan"] as const) {
    sim.setHue(hue);
    for (let tap = 0; tap < 4; tap++) {
      assert.equal(sim.pointerDown(sim.snapshot.x, sim.snapshot.y), true);
      sim.pointerUp();
      sim.tick(STEP);
    }
    assert.equal(sim.dropCount, 1);
    assert.equal(sim.snapshot.mass, initial.mass);
    assert.equal(sim.snapshot.hue, hue);
  }
  sim.setHue("rose");
  sim.pointerDown(500, 325);
  sim.pointerMove(780, 480);
  advance(sim, 20);
  sim.reset();
  assert.equal(sim.dropCount, 1);
  assert.deepEqual(sim.snapshot, { ...initial, hue: "rose" });
});

test("drag transfers into glide without adding a second release impulse", () => {
  const sim = movingDrop();
  const held = sim.snapshot;
  assert.ok(held.x > 500 && held.x < 780);
  assert.ok(held.vx > 0);
  assert.equal(held.grabbed, true);
  sim.pointerUp();
  const released = sim.snapshot;
  assert.equal(released.vx, held.vx);
  assert.equal(released.vy, held.vy);
  assert.equal(released.grabbed, false);
  assert.equal(released.pointer, null);
  sim.tick(STEP);
  assert.ok(sim.snapshot.x > released.x);
  assert.ok(sim.snapshot.vx > 0 && sim.snapshot.vx < released.vx);
  assert.equal(sim.pointerDown(sim.snapshot.x, sim.snapshot.y), true);
  assert.equal(sim.snapshot.grabbed, true);
});

test("misses do not grab and snapshot consumers cannot move the simulation", () => {
  const sim = new DropletSimulation();
  assert.equal(sim.pointerDown(0, 0), false);
  assert.equal(sim.snapshot.pointer, null);
  sim.pointerMove(800, 500);
  advance(sim, 12);
  assert.equal(sim.snapshot.x, 500);
  sim.pointerDown(500, 325);
  const external = sim.snapshot;
  external.x = -100;
  external.pointer!.x = -100;
  external.wallImpulse.x = 999;
  assert.equal(sim.snapshot.x, 500);
  assert.equal(sim.snapshot.pointer!.x, 500);
  assert.equal(sim.snapshot.wallImpulse.x, 0);
});

test("wall collisions stay bounded, reverse velocity and expose a visual impulse", () => {
  const sim = movingDrop();
  sim.pointerUp();
  let bounced = false;
  const mass = sim.snapshot.mass;
  for (let frame = 0; frame < 240; frame++) {
    sim.tick(STEP);
    const snap = sim.snapshot;
    const inset = 26 + snap.r;
    assert.ok(snap.x >= inset && snap.x <= sim.width - inset);
    assert.ok(snap.y >= inset && snap.y <= sim.height - inset);
    assert.equal(snap.mass, mass);
    assert.equal(sim.dropCount, 1);
    if (snap.wallImpulse.x < 0) {
      bounced = true;
      assert.ok(snap.vx < 0);
    }
  }
  assert.equal(bounced, true);
  assert.equal(sim.snapshot.wallImpulse.x, 0);
});

test("identical input sequences yield identical simulation snapshots", () => {
  function replay(): object[] {
    const sim = new DropletSimulation();
    const samples: object[] = [];
    sim.pointerDown(500, 325);
    for (let frame = 0; frame < 180; frame++) {
      if (frame < 32) sim.pointerMove(500 + frame * 14, 325 + frame * 7);
      if (frame === 32) sim.pointerUp();
      if (frame === 70) sim.setHue("amber");
      if (frame === 95) sim.pointerDown(sim.snapshot.x, sim.snapshot.y);
      if (frame > 95 && frame < 130) sim.pointerMove(200, 170);
      if (frame === 130) sim.pointerUp();
      sim.tick(frame % 2 === 0 ? 1 / 120 : 1 / 40);
      samples.push(sim.snapshot);
    }
    return samples;
  }
  assert.deepEqual(replay(), replay());
});

test("a long paused frame is capped and cannot create a deferred catch-up", () => {
  const paused = movingDrop();
  const capped = movingDrop();
  paused.pointerUp();
  capped.pointerUp();
  paused.tick(600);
  capped.tick(1 / 12);
  assert.deepEqual(paused.snapshot, capped.snapshot);
  advance(paused, 5);
  advance(capped, 5);
  assert.deepEqual(paused.snapshot, capped.snapshot);
  const before = paused.snapshot;
  for (const invalid of [0, -1, NaN, Infinity]) paused.tick(invalid);
  assert.deepEqual(paused.snapshot, before);
});

test("one second of free motion is consistent at 15, 24, 30, 60 and 120 Hz", () => {
  const snapshots = [15, 24, 30, 60, 120].map((hz) => {
    // Give every run the same two-dimensional drag history before changing its
    // render cadence; the following second has no pointer input.
    const sim = new DropletSimulation();
    sim.pointerDown(500, 325);
    sim.pointerMove(780, 465);
    advance(sim, 12);
    sim.pointerUp();
    for (let frame = 0; frame < hz; frame++) sim.tick(1 / hz);
    return { hz, snapshot: sim.snapshot };
  });
  const reference = snapshots.find(({ hz }) => hz === 60)!.snapshot;
  assert.ok(Math.abs(reference.vx) > 1 && Math.abs(reference.vy) > 1);
  for (const { hz, snapshot } of snapshots) {
    for (const key of ["x", "y", "vx", "vy"] as const) {
      assert.ok(Math.abs(snapshot[key] - reference[key]) < 1e-9,
        `${key} differs at ${hz} Hz: ${snapshot[key]} vs ${reference[key]}`);
    }
    assert.equal(snapshot.mass, reference.mass);
    assert.equal(snapshot.hue, reference.hue);
    assert.equal(snapshot.grabbed, false);
  }
});

test("radius configuration preserves its corresponding mass", () => {
  const sim = new DropletSimulation({ radius: 82 });
  sim.setHue("amber");
  advance(sim, 300);
  assert.equal(sim.snapshot.r, 82);
  assert.equal(sim.snapshot.mass, 82 * 82);
  assert.equal(sim.dropCount, 1);
  assert.throws(() => new DropletSimulation({ radius: NaN }), RangeError);
});

test("resizing remaps usable space without reseeding or changing momentum and mass", (t) => {
  t.mock.method(Math, "random", () => {
    throw new Error("Resizing must not activate legacy random reseeding.");
  });
  const sim = movingDrop();
  sim.setHue("rose");
  const before = sim.snapshot;
  const oldInset = 26 + before.r;
  const relativeX = (before.x - oldInset) / (sim.width - oldInset * 2);
  const relativeY = (before.y - oldInset) / (sim.height - oldInset * 2);
  sim.resize(550, 900);
  const after = sim.snapshot;
  const newInset = 22 + after.r;
  assert.equal(sim.width, 550);
  assert.equal(sim.height, 900);
  assert.equal(sim.dropCount, 1);
  assert.equal(after.mass, before.mass);
  assert.equal(after.hue, before.hue);
  assert.equal(after.vx, before.vx);
  assert.equal(after.vy, before.vy);
  assert.equal(after.grabbed, true);
  assert.ok(Math.abs((after.x - newInset) / (sim.width - newInset * 2) - relativeX) < 1e-12);
  assert.ok(Math.abs((after.y - newInset) / (sim.height - newInset * 2) - relativeY) < 1e-12);
  assert.ok(after.pointer);

  // Repeated responsive layout changes preserve the fixture's state, including
  // a collapsed container and subsequent recovery to the original dimensions.
  for (const [width, height] of [[1200, 450], [0, 0], [1000, 650]]) {
    sim.resize(width, height);
    assert.equal(sim.snapshot.mass, before.mass);
    assert.equal(sim.snapshot.hue, "rose");
    assert.equal(sim.snapshot.vx, before.vx);
    assert.equal(sim.snapshot.vy, before.vy);
    assert.equal(sim.dropCount, 1);
    const inset = Math.max(22, Math.min(sim.width, sim.height) * 0.04) + before.r;
    assert.ok(sim.snapshot.x >= inset && sim.snapshot.x <= sim.width - inset);
    assert.ok(sim.snapshot.y >= inset && sim.snapshot.y <= sim.height - inset);
  }
  assert.ok(Math.abs(sim.snapshot.x - before.x) < 1e-9);
  assert.ok(Math.abs(sim.snapshot.y - before.y) < 1e-9);
  sim.resize(550, 900);
  sim.reset();
  assert.equal(sim.snapshot.x, 275);
  assert.equal(sim.snapshot.y, 450);
  assert.equal(sim.snapshot.mass, before.mass);
  assert.equal(sim.snapshot.hue, "rose");
  assert.equal(sim.snapshot.grabbed, false);
});
