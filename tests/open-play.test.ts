import assert from 'node:assert/strict';
import test from 'node:test';
import { OPEN_LAYOUT, OpenPlaySimulation } from '../src/experiments/open-play/simulation';
import { purityOf } from '../src/game/palette';

const advance = (s: OpenPlaySimulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) s.tick(1 / 60); };
const byHue = (s: OpenPlaySimulation, hue: 'cyan' | 'rose' | 'amber') => s.core.drops.filter(d => d.pigment[hue] > 0);
const total = (s: OpenPlaySimulation) => s.core.drops.reduce((n, d) => n + d.mass, 0);
function carry(s: OpenPlaySimulation, id: number, x: number, y: number, seconds = 1.2) {
  assert.equal(s.grab(id), true);
  const d = s.core.drops.find(d => d.id === id)!;
  const from = { x: d.x, y: d.y }; const steps = Math.ceil(seconds * 60);
  for (let i = 1; i <= steps; i++) { s.move(from.x + (x - from.x) * i / steps, from.y + (y - from.y) * i / steps); s.tick(1 / 60); }
}

test('twelve drops, four of each colour, none touching at rest', () => {
  assert.equal(OPEN_LAYOUT.length, 12);
  for (const hue of ['cyan', 'rose', 'amber'] as const) assert.equal(OPEN_LAYOUT.filter(d => d.hue === hue).length, 4);
  for (let i = 0; i < OPEN_LAYOUT.length; i++) for (let j = i + 1; j < OPEN_LAYOUT.length; j++) {
    const a = OPEN_LAYOUT[i], b = OPEN_LAYOUT[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 8, `${i} and ${j} start too close`);
  }
  const s = new OpenPlaySimulation(); const mass = total(s);
  advance(s, 3);
  assert.equal(s.core.drops.length, 12, 'nothing fuses without a touch');
  assert.ok(Math.abs(total(s) - mass) < 1e-6);
});

test('each colour has a close pair that one short drag fuses', () => {
  const s = new OpenPlaySimulation();
  const [a, b] = byHue(s, 'cyan');
  carry(s, b.id, a.x + a.r + b.r - 4, a.y, 0.5); s.release(); advance(s, 0.3);
  assert.equal(byHue(s, 'cyan').length, 3);
  assert.equal(s.events.length, 1);
});

test('different colours bounce on a normal hit and keep their colours', () => {
  const s = new OpenPlaySimulation();
  const rose = s.core.drops.find(d => d.id === 1007)!, amber = s.core.drops.find(d => d.id === 1010)!;
  rose.vx = 400; rose.vy = (amber.y - rose.y) / (amber.x - rose.x) * 400;
  advance(s, 1);
  assert.equal(s.core.drops.length, 12);
  assert.ok(s.core.drops.every(d => purityOf(d.pigment) > 0.999));
  assert.ok(s.contacts.some(c => c.kind === 'drop'), 'the bounce is reported for squash and sound');
});

test('a held, slow push mixes two colours, and a double tap separates them again', () => {
  const s = new OpenPlaySimulation();
  const rose = s.core.drops.find(d => d.id === 1007)!, amber = s.core.drops.find(d => d.id === 1010)!;
  // Only these two on the board, so no other drop joins in.
  s.core.drops = [rose, amber];
  const mass = total(s);
  amber.x = 400; amber.y = 400;
  rose.x = amber.x - 90; rose.y = 400;
  // Touch it, then keep pressing slowly toward it with the finger ahead of the drop.
  carry(s, rose.id, amber.x - amber.r - rose.r + 40, 400, 1);
  for (let i = 0; i < 60 && s.core.drops.length === 2; i++) { const a = s.core.drops.find(d => d.id === amber.id); if (a) s.move(a.x - a.r - rose.r + 40, a.y); s.tick(1 / 60); }
  s.release(); advance(s, 0.4);
  const mixed = s.core.drops.find(d => d.pigment.rose > 0 && d.pigment.amber > 0);
  assert.ok(mixed, 'pressing in slowly should mix');
  assert.equal(s.core.drops.length, 1);
  // First tap grabs, the second within 0.32 s separates instead of grabbing.
  assert.equal(s.grab(mixed.id), true); s.release(); advance(s, 0.1);
  assert.equal(s.grab(mixed.id), false);
  assert.equal(s.splits.length, 1);
  assert.equal(s.splits[0].children.length, 1, 'the released drop is reported for the spray');
  assert.ok(purityOf(s.splits[0].children[0].pigment) > 0.999);
  assert.equal(s.core.drops.length, 2);
  assert.ok(s.core.drops.every(d => purityOf(d.pigment) > 0.999), 'each colour is pure again');
  assert.ok(Math.abs(total(s) - mass) < 1e-6, 'separation keeps the total amount');
  assert.equal(s.core.grabbedId, null);
});

test('a slow double tap on a pure drop just grabs it', () => {
  const s = new OpenPlaySimulation();
  assert.equal(s.grab(1000), true); s.release(); advance(s, 0.1);
  assert.equal(s.grab(1000), true, 'nothing to separate, so the second tap grabs');
  s.release(); advance(s, 0.5);
  assert.equal(s.grab(1000), true);
  assert.equal(s.splits.length, 0);
});

test('a quick hit or a touch without pressing does not mix', () => {
  const s = new OpenPlaySimulation();
  const rose = s.core.drops.find(d => d.id === 1007)!, amber = s.core.drops.find(d => d.id === 1010)!;
  s.core.drops = [rose, amber];
  amber.x = 400; amber.y = 400; rose.x = 300; rose.y = 400;
  // Held and resting against it, finger on the drop itself: no press.
  carry(s, rose.id, amber.x - amber.r - rose.r + 2, 400, 0.6);
  advance(s, 1);
  assert.equal(s.core.drops.length, 2);
  s.release();
  // A fast throw bounces.
  const t = new OpenPlaySimulation();
  const r2 = t.core.drops.find(d => d.id === 1007)!, a2 = t.core.drops.find(d => d.id === 1010)!;
  t.core.drops = [r2, a2]; a2.x = 400; a2.y = 400; r2.x = 250; r2.y = 400; r2.vx = 700;
  advance(t, 1);
  assert.equal(t.core.drops.length, 2);
});

test('"again" restores the curated layout and clears pending events', () => {
  const s = new OpenPlaySimulation();
  carry(s, 1001, 150, 170, 0.8); s.release(); advance(s, 0.5);
  s.reset();
  assert.equal(s.core.drops.length, 12);
  assert.deepEqual(s.core.drops.map(d => [d.x, d.y, d.r]), OPEN_LAYOUT.map(d => [d.x, d.y, d.r]));
  assert.equal(s.events.length + s.contacts.length + s.splits.length, 0);
});

test('larger check boards keep colours balanced, fit the board and start apart', async () => {
  const { openLayout, OPEN_BOARD, OPEN_COUNTS } = await import('../src/experiments/open-play/simulation');
  for (const n of OPEN_COUNTS) {
    const layout = openLayout(n);
    assert.equal(layout.length, n);
    for (const hue of ['cyan', 'rose', 'amber'] as const) assert.equal(layout.filter(d => d.hue === hue).length, n / 3);
    for (const d of layout) assert.ok(d.x - d.r > 28 && d.x + d.r < OPEN_BOARD.width - 28 && d.y - d.r > 28 && d.y + d.r < OPEN_BOARD.height - 28);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = layout[i], b = layout[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 4, `${n}: ${i}/${j}`);
    }
    const s = new OpenPlaySimulation(n);
    assert.equal(s.core.drops.length, n);
  }
  assert.equal(openLayout(7).length, 12, 'unsupported counts fall back to the curated board');
});
