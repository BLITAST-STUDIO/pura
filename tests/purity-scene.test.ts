import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_SCENE, PuritySimulation } from '../src/experiments/purity-scene/simulation';

const advance = (s: PuritySimulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) s.tick(1 / 60); };
const amounts = (s: PuritySimulation) => s.core.drops.reduce((n, d) => ({ cyan: n.cyan + d.pigment.cyan, rose: n.rose + d.pigment.rose }), { cyan: 0, rose: 0 });
function placeAllCyan(s: PuritySimulation, x: number, y: number) {
  for (const d of s.core.drops.filter(d => d.pigment.cyan > 0)) { d.x = x; d.y = y; d.vx = 0; d.vy = 0; }
  advance(s, .05);
}

test('fixed scene and a resize retain composition, positions and undo history', () => {
  const s = new PuritySimulation();
  assert.equal(s.core.drops.length, 5); assert.equal(s.state().gathered, 1 / 3);
  const before = structuredClone(s.core.drops);
  s.grab(s.core.drops[0].id); s.move(130, 540); advance(s, .2); s.release();
  s.resize(1000, 400);
  assert.equal(s.width, 550); assert.equal(s.height, 650);
  assert.equal(s.undo(), true); assert.deepEqual(s.core.drops, before);
  assert.equal(s.state().canUndo, false);
});

test('undo restores an entire mixed gesture, stops drift, and supports another fusion', () => {
  const s = new PuritySimulation(); const total = amounts(s);
  const before = structuredClone(s.core.drops);
  s.grab(s.core.drops[0].id);
  s.core.drops[0].x = s.core.drops[3].x; s.core.drops[0].y = s.core.drops[3].y;
  advance(s, .05); s.release(); advance(s, .2);
  assert.equal(s.state().contaminated, true); assert.ok(s.state().purity < .9);
  assert.deepEqual(amounts(s), total);
  assert.equal(s.undo(), true); assert.deepEqual(s.core.drops, before);
  assert.equal(s.events.length, 0); assert.equal(s.core.grabbedId, null);
  placeAllCyan(s, 130, 510);
  assert.equal(s.core.drops.length, 3); assert.equal(new Set(s.core.drops.map(d => d.id)).size, 3);
  assert.deepEqual(amounts(s), total);
});

test('all cyan, purity, containment, release and settling are required for success', () => {
  const s = new PuritySimulation(); const goal = FIRST_SCENE.goal;
  s.core.drops[0].x = goal.x; s.core.drops[0].y = goal.y;
  advance(s, 1); assert.equal(s.completed, false);
  placeAllCyan(s, 130, 510);
  assert.equal(s.state().ready, true); advance(s, 1); assert.equal(s.completed, false);
  const d = s.core.drops.find(d => d.pigment.cyan > 0)!;
  d.x = goal.x + goal.r - d.r + 2; d.y = goal.y;
  advance(s, 1); assert.equal(s.completed, false);
  d.x = goal.x; d.y = goal.y; s.grab(d.id);
  advance(s, 1); assert.equal(s.completed, false);
  s.release(); advance(s, .2); assert.equal(s.completed, false);
  advance(s, .4); assert.equal(s.completed, true);
  s.undo(); assert.equal(s.completed, false);
});

test('rose-dominant liquid cannot clear a cyan goal and reset recovers the scene', () => {
  const s = new PuritySimulation();
  placeAllCyan(s, 130, 510);
  const d = s.core.drops.find(d => d.pigment.cyan > 0)!;
  d.pigment.rose = d.pigment.cyan * 9; d.mass = d.pigment.cyan + d.pigment.rose;
  d.x = FIRST_SCENE.goal.x; d.y = FIRST_SCENE.goal.y;
  advance(s, 1);
  assert.ok(s.state().purity < .11); assert.equal(s.state().ready, false); assert.equal(s.completed, false);
  s.reset(); assert.equal(s.state().purity, 1); assert.equal(s.state().canUndo, false); assert.equal(s.core.drops.length, 5);
});

test('a deliberately wide route is solvable with pointer input and retained quantities', () => {
  const s = new PuritySimulation(); const total = amounts(s);
  // Move the right cyan underneath the rose, then join the left column and goal.
  assert.equal(s.grab(1002), true);
  for (const [x, y] of [[410, 550], [130, 550], [125, 312], [155, 132]]) {
    // Waypoints advance slowly enough to avoid flinging across the inside corner.
    const p = { ...s.core.pointer! };
    for (let i = 1; i <= 100; i++) { s.move(p.x + (x - p.x) * i / 100, p.y + (y - p.y) * i / 100); s.tick(1 / 60); }
    advance(s, .8);
  }
  s.release(); advance(s, 1);
  assert.equal(s.completed, true); assert.equal(s.state().purity, 1); assert.deepEqual(amounts(s), total);
});
