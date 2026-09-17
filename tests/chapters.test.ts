import test from 'node:test';
import assert from 'node:assert/strict';
import { PuritySimulation } from '../src/experiments/purity-scene/simulation';
import { PROGRESS_KEY, readProgress, writeProgress } from '../src/experiments/purity-scene/progress';

function advance(s: PuritySimulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) s.tick(1 / 60); }
function move(s: PuritySimulation, x: number, y: number, duration = 2) {
  const from = { ...s.core.pointer! }; const steps = Math.ceil(duration * 60);
  for (let i = 1; i <= steps; i++) { s.move(from.x + (x - from.x) * i / steps, from.y + (y - from.y) * i / steps); s.tick(1 / 60); }
  advance(s, .8);
}
function collect(s: PuritySimulation, hue: 'cyan' | 'rose', x: number, y: number) {
  for (const d of s.core.drops.filter(d => d.pigment[hue] > 0)) { d.x = x; d.y = y; d.vx = 0; d.vy = 0; }
  advance(s, .1);
}

test('chapter two permits a small drop through the gap but holds a merged drop', () => {
  const small = new PuritySimulation(2); small.grab(1001); move(small, 350, 200); small.release();
  const smallDrop = small.core.drops.find(d => d.id === 1001)!;
  assert.ok(smallDrop.y < 240); assert.equal(smallDrop.r, 36);
  const large = new PuritySimulation(2); collect(large, 'cyan', 350, 540);
  const d = large.core.drops[0]; large.grab(d.id); move(large, 350, 200, 4);
  assert.ok(d.y > 350, `large drop must remain below the gap: ${d.y}`);
  assert.equal(large.core.drops.length, 1); assert.equal(d.mass, 3 * 36 ** 2);
  for (const o of large.chapter.obstacles) assert.ok(Math.hypot(d.x - o.x, d.y - o.y) >= d.r + o.r - 1e-6);
});

test('chapter two is solvable via the wider outside route after collecting first', () => {
  const s = new PuritySimulation(2); collect(s, 'cyan', 350, 540);
  s.grab(s.core.drops[0].id);
  for (const [x, y] of [[125, 540], [125, 140], [350, 140]]) move(s, x, y);
  s.release(); advance(s, 1);
  assert.equal(s.completed, true); assert.equal(s.state().purity, 1);
});

test('chapter three needs both colors in their own goals and allows delivery while holding the other', () => {
  const s = new PuritySimulation(3);
  collect(s, 'cyan', 160, 135);
  const rose = s.core.drops.find(d => d.pigment.rose > 0)!;
  s.grab(rose.id); advance(s, 1);
  assert.equal(s.state().targets[0].delivered, true); assert.equal(s.completed, false);
  s.release(); collect(s, 'rose', 490, 420); advance(s, 1);
  assert.equal(s.state().targets[1].ready, true); assert.equal(s.state().targets[1].inGoal, false); assert.equal(s.completed, false);
  const roseCore = s.core.drops.find(d => d.pigment.rose > 0)!;
  s.grab(roseCore.id); move(s, 490, 135); s.release(); advance(s, 1);
  assert.equal(s.completed, true); assert.ok(s.state().targets.every(t => t.delivered));
  s.undo(); assert.equal(s.completed, false); assert.equal(s.state().targets[1].inGoal, false);
  s.reset(); assert.equal(s.core.drops.length, 4); assert.equal(s.state().canUndo, false);
});

test('chapter three has an unpolluted route using pointer input for both colors', () => {
  const s = new PuritySimulation(3);
  s.grab(1001);
  for (const [x, y] of [[330, 470], [155, 510], [95, 510], [95, 180], [160, 135]]) move(s, x, y);
  s.release(); advance(s, 1);
  assert.equal(s.state().targets[0].delivered, true);
  const rose = s.core.drops.find(d => d.pigment.rose > 0 && d.y > 450)!;
  s.grab(rose.id);
  for (const [x, y] of [[380, 460], [195, 340], [490, 340], [490, 135]]) move(s, x, y);
  s.release(); advance(s, 1);
  assert.equal(s.completed, true); assert.ok(s.state().targets.every(t => t.purity === 1));
});

test('chapter progress validates input, merges wins, and never touches legacy storage', () => {
  const data = new Map([['pura-save-v1', 'untouched']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.deepEqual(readProgress(storage), { v: 1, completed: [], last: 1 });
  storage.setItem(PROGRESS_KEY, '{broken'); assert.equal(readProgress(storage).last, 1);
  storage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, completed: [1, 1, 4, '2', null], last: 99 }));
  assert.deepEqual(readProgress(storage), { v: 1, completed: [1], last: 1 });
  assert.equal(writeProgress({ v: 1, completed: [2], last: 3 }, storage), true);
  assert.deepEqual(readProgress(storage), { v: 1, completed: [1, 2], last: 3 });
  assert.equal(data.get('pura-save-v1'), 'untouched');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(readProgress(blocked).completed.length, 0); assert.equal(writeProgress({ v: 1, completed: [3], last: 3 }, blocked), false);
});
