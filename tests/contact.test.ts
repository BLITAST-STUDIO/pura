import assert from 'node:assert/strict';
import test from 'node:test';
import { PuraSim, type ContactKind } from '../src/game/sim';
import { SANDBOX } from '../src/game/levels';
import { emptyPigment } from '../src/game/palette';
import { FusionSimulation } from '../src/experiments/fusion-lab/simulation';
import { PuritySimulation } from '../src/experiments/purity-scene/simulation';
import { DropletMotion } from '../src/experiments/droplet-lab/motion';
import { DropletSimulation } from '../src/experiments/droplet-lab/simulation';

type Contact = { id: number; x: number; y: number; kind: ContactKind };

function lone(vx: number, vy = 0, x = 300, y = 300) {
  const sim = new PuraSim();
  sim.level = SANDBOX;
  sim.resize(600, 600);
  const pigment = emptyPigment();
  pigment.cyan = 40 * 40;
  sim.drops = [{ id: 1, x, y, vx, vy, r: 40, renderR: 40, mass: 40 * 40, pigment, freshness: 0 }];
  return sim;
}

test('a wall hit reports the velocity change pointing away from the wall', () => {
  const sim = lone(-600);
  const seen: Contact[] = [];
  sim.onContact = (id, x, y, kind) => seen.push({ id, x, y, kind });
  for (let i = 0; i < 60 && !seen.length; i++) sim.tick(1 / 60);
  assert.equal(seen.length, 1);
  const [hit] = seen;
  assert.equal(hit.kind, 'wall');
  assert.equal(hit.id, 1);
  assert.ok(hit.x > 0, 'left wall pushes toward +x');
  assert.equal(hit.y, 0);
  // Reflection with restitution .38 reverses and keeps 38% of the approach speed.
  const approach = -sim.drops[0].vx / 0.38;
  assert.ok(Math.abs(hit.x - 1.38 * -approach) < 1e-6, `impulse ${hit.x} vs approach ${approach}`);
});

test('observing contacts leaves every physics result bit-identical', () => {
  const plain = lone(-700, 430);
  const observed = lone(-700, 430);
  let count = 0;
  observed.onContact = () => { count++; };
  for (let i = 0; i < 240; i++) { plain.tick(1 / 60); observed.tick(1 / 60); }
  assert.ok(count >= 2, 'the corner route should hit at least two walls');
  assert.deepEqual(observed.drops, plain.drops);
});

test('resize clamping is not reported as a contact', () => {
  const sim = lone(0, 0, 560, 300);
  let count = 0;
  sim.onContact = () => { count++; };
  sim.resize(400, 600);
  assert.equal(count, 0);
});

test('chapter two islands report obstacle contacts and keep the drop outside', () => {
  const s = new PuritySimulation(2);
  const drop = s.core.drops.find(d => d.id === 1000)!;
  const stone = s.chapter.obstacles[0];
  drop.x = stone.x; drop.y = stone.y + stone.r + drop.r + 30; drop.vx = 0; drop.vy = -500;
  for (let i = 0; i < 30; i++) s.tick(1 / 60);
  const stones = s.contacts.filter(c => c.kind === 'obstacle' && c.id === drop.id);
  assert.ok(stones.length >= 1, 'the island hit should be observed');
  assert.ok(stones[0].y > 0, 'an island below the drop pushes it down the board (+y)');
  assert.ok(Math.hypot(drop.x - stone.x, drop.y - stone.y) >= drop.r + stone.r - 1e-6);
});

test('undo and reset attach observers to the fresh core', () => {
  const s = new PuritySimulation(1);
  s.grab(1000); s.release(); s.undo();
  const drop = s.core.drops[0];
  drop.x = s.core.pad + drop.r + 2; drop.vx = -400;
  for (let i = 0; i < 10; i++) s.tick(1 / 60);
  assert.ok(s.contacts.some(c => c.kind === 'wall'));
  const fusion = new FusionSimulation();
  fusion.reset('chain');
  assert.equal(fusion.contacts.length, 0);
  fusion.core.drops[0].vx = -2000;
  for (let i = 0; i < 20; i++) fusion.tick(1 / 60);
  assert.ok(fusion.contacts.some(c => c.kind === 'wall'));
});

test('pending contacts stay bounded when nothing drains them', () => {
  const s = new FusionSimulation();
  s.reset('pair');
  const drop = s.core.drops[0];
  s.grab(drop.id);
  // Holding a drop into a wall reports a contact on nearly every physics step.
  for (let i = 0; i < 1200; i++) { s.move(-500, drop.y); s.tick(1 / 60); }
  assert.ok(s.contacts.length > 0 && s.contacts.length <= 512);
});

test('reported wall contacts match the approved one-drop study impulse', () => {
  const droplet = new DropletSimulation({ radius: 40 });
  const core = (droplet as unknown as { core: PuraSim }).core;
  core.drops[0].vx = -650;
  core.drops[0].vy = 180;
  let frame = { x: 0, y: 0 };
  core.onContact = (_id, x, y) => { frame.x += x; frame.y += y; };
  const motion = new DropletMotion();
  let hits = 0;
  let squash = 0;
  for (let i = 0; i < 180; i++) {
    frame = { x: 0, y: 0 };
    droplet.tick(1 / 60);
    const approved = droplet.snapshot.wallImpulse;
    for (const axis of ['x', 'y'] as const) {
      // The study also counts the step's .8% damping; everything else is the reflection.
      assert.ok(Math.abs(frame[axis] - approved[axis]) <= Math.abs(approved[axis]) * .01 + 1e-9,
        `frame ${i} ${axis}: ${frame[axis]} vs ${approved[axis]}`);
    }
    if (frame.x || frame.y) hits++;
    const s = droplet.snapshot;
    squash = Math.max(squash, motion.update({ vx: s.vx, vy: s.vy, grabbed: false, wallImpulse: frame }, 1 / 60).squash);
  }
  assert.ok(hits >= 2);
  assert.ok(squash > .05, `wall should visibly flatten the drop, got ${squash}`);
});
