import assert from 'node:assert/strict';
import test from 'node:test';
import { isPolygon, polygonContact, polygonVertices, type Obstacle } from '../src/game/obstacle';
import { PuraSim } from '../src/game/sim';
import { SANDBOX } from '../src/game/levels';
import { emptyPigment } from '../src/game/palette';

const square: Obstacle & { n: number } = { x: 200, y: 280, r: 40, n: 4, a: 45 }; // axis-aligned, half-side 28.28
const triangle: Obstacle & { n: number } = { x: 200, y: 280, r: 40, n: 3, a: 270 }; // pointing up
const half = 40 * Math.SQRT1_2;

test('a regular polygon sits on its circle: corners at the angle, turned in board coordinates (y down)', () => {
  const v = polygonVertices(triangle);
  assert.equal(v.length, 3);
  assert.ok(Math.abs(v[0].x - 200) < 1e-9 && Math.abs(v[0].y - 240) < 1e-9, 'a = 270 points up (smaller y)');
  const s = polygonVertices(square);
  assert.ok(Math.abs(s[0].x - (200 + half)) < 1e-9 && Math.abs(s[0].y - (280 + half)) < 1e-9, 'a = 45 makes an axis-aligned square');
  assert.ok(isPolygon(square) && !isPolygon({ x: 0, y: 0, r: 5 }));
});

test('circle against polygon: apart, face contact, corner contact, and a centre inside pushed out the near face', () => {
  assert.equal(polygonContact(square, 200, 280 - half - 30, 18), null, 'above, clear');
  const face = polygonContact(square, 200, 280 - half - 10, 18)!; // 8 deep into the top face
  assert.ok(Math.abs(face.nx) < 1e-9 && Math.abs(face.ny + 1) < 1e-9, 'the top face pushes straight up');
  assert.ok(Math.abs(face.y - (280 - half - 18)) < 1e-9, 'resting just touching the face');
  const corner = polygonContact(square, 200 + half + 8, 280 - half - 8, 18)!; // beyond the top-right corner, 11.3 away
  assert.ok(corner.nx > 0.65 && corner.ny < -0.65, 'a corner pushes away along the diagonal');
  assert.ok(Math.abs(Math.hypot(corner.x - (200 + half), corner.y - (280 - half)) - 18) < 1e-9, 'resting a radius from the corner');
  assert.equal(polygonContact(square, 200 + half + 8, 280 - half - 18, 18), null, 'far enough from the corner (19.7 > 18)');
  const inside = polygonContact(square, 200 + 20, 280 + 3, 18)!;
  assert.ok(inside.nx > 0.99, 'the right face is nearest, so out through it');
  assert.ok(inside.x > 200 + half, 'and now clear of it');
});

function drop(sim: PuraSim, x: number, y: number, r: number, vx: number, vy: number) {
  const pigment = emptyPigment(); pigment.cyan = r * r;
  sim.drops.push({ id: sim.drops.length + 1, x, y, vx, vy, r, renderR: r, mass: r * r, pigment, freshness: 0 });
}
function world(obstacle: Obstacle) {
  const sim = new PuraSim(); sim.level = SANDBOX; sim.resize(420, 560); sim.drops = []; sim.obstacles = [obstacle];
  sim.tuning = { ...sim.tuning, grabK: 0, grabDamp: 0, attraction: 0 };
  return sim;
}

test('a drop bounces off a square face like a wall, off a tilted face at the mirrored angle', () => {
  const sim = world(square); drop(sim, 200, 480, 18, 0, -300);
  let contact = 0; sim.onContact = (_id, _ix, _iy, kind) => { if (kind === 'obstacle') contact++; };
  for (let i = 0; i < 120; i++) sim.tick(1 / 60);
  assert.ok(contact >= 1, 'it touched the stone');
  assert.ok(sim.drops[0].vy > 0, 'and came back down the way it went up');
  assert.ok(Math.abs(sim.drops[0].vx) < 1, 'straight on, straight back');
  // The triangle's right face slopes: a drop coming from the right is turned upward, not reflected straight back.
  const tri = world({ ...triangle, a: 270 }); drop(tri, 330, 285, 18, -300, 0);
  for (let i = 0; i < 40; i++) tri.tick(1 / 60);
  assert.ok(tri.drops[0].vy !== 0 && Math.abs(tri.drops[0].vy) > 20, 'a sloped face sends it sideways');
});

test('no drop, however fast, ends inside a polygon (fuzz over corners, faces, sizes and angles)', () => {
  let seed = 99; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  let worst = 0, hits = 0;
  for (let n = 0; n < 300; n++) {
    const sides = [3, 4, 6][n % 3], a = Math.floor(rnd() * (360 / sides / 15)) * 15;
    const o: Obstacle & { n: number } = { x: 210, y: 280, r: [24, 32, 40][Math.floor(rnd() * 3)], n: sides, a };
    const sim = world(o); const r = [20, 26, 32][Math.floor(rnd() * 3)];
    const ang = rnd() * Math.PI * 2, dist = 150 + rnd() * 40, speed = 200 + rnd() * 520;
    drop(sim, 210 + Math.cos(ang) * dist, 280 + Math.sin(ang) * dist, r, -Math.cos(ang) * speed + (rnd() - .5) * 120, -Math.sin(ang) * speed + (rnd() - .5) * 120);
    sim.onContact = (_i, _x, _y, kind) => { if (kind === 'obstacle') hits++; };
    for (let i = 0; i < 360; i++) {
      sim.tick(1 / 120);
      const d = sim.drops[0], c = polygonContact(o, d.x, d.y, d.r);
      worst = Math.max(worst, c ? Math.hypot(c.x - d.x, c.y - d.y) : 0);
    }
  }
  assert.ok(hits > 200, `most runs hit the stone (${hits})`);
  assert.ok(worst < 1.5, `the deepest overlap after a step stays tiny (${worst.toFixed(3)})`);
});

test('circle stones are untouched: the same contact response as before', () => {
  const sim = world({ x: 210, y: 280, r: 30 }); drop(sim, 210, 420, 20, 0, -400);
  for (let i = 0; i < 60; i++) sim.tick(1 / 60);
  assert.ok(sim.drops[0].vy > 0 && Math.abs(sim.drops[0].vx) < 1e-6, 'a head-on hit on a round stone returns straight back');
});
