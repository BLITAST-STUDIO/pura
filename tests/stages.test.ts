import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from '../src/game/levels';
import { clampSandboxCount, STAGE_IDS, StageSimulation, type StageScale } from '../src/experiments/stages/simulation';

const setup = (stage: number, scale: StageScale = 'large') => ({ stage, scale, mix: 'press' as const, sandboxCount: 60 });

test('every legacy stage spawns its colours and counts, apart, at both sizes', () => {
  for (const scale of ['large', 'original'] as const) for (const id of STAGE_IDS) {
    const s = new StageSimulation(setup(id, scale));
    const def = s.def;
    const expected = def.sandbox ? 60 : def.perColor * def.colors.length;
    assert.equal(s.core.drops.length, expected, `${scale} ${id}`);
    for (const hue of def.colors) assert.equal(s.core.drops.filter(d => d.pigment[hue] > 0).length, expected / def.colors.length);
    let touching = 0;
    const ds = s.core.drops;
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (Math.hypot(ds[i].x - ds[j].x, ds[i].y - ds[j].y) < ds[i].r + ds[j].r) touching++;
    assert.equal(touching, 0, `${scale} stage ${id} starts with overlaps`);
    for (const d of ds) assert.ok(d.x - d.r >= s.core.pad - 1e-6 && d.x + d.r <= s.width - s.core.pad + 1e-6);
  }
});

test('the same stage and size always deal the same board', () => {
  const a = new StageSimulation(setup(4)), b = new StageSimulation(setup(4));
  assert.deepEqual(a.core.drops.map(d => [d.x, d.y, d.r]), b.core.drops.map(d => [d.x, d.y, d.r]));
  a.reset();
  assert.deepEqual(a.core.drops.map(d => [d.x, d.y, d.r]), b.core.drops.map(d => [d.x, d.y, d.r]));
});

test('larger size scales radii by 1.5 while targets stay legacy fractions', () => {
  const big = new StageSimulation(setup(3, 'large')), small = new StageSimulation(setup(3, 'original'));
  const mean = (s: StageSimulation) => s.core.drops.reduce((n, d) => n + d.r, 0) / s.core.drops.length;
  assert.ok(Math.abs(mean(big) / mean(small) - 1.5) < 0.2);
  const def = LEVELS[2];
  for (const c of big.core.coreStats()) assert.ok(Math.abs(c.target - big.core.quota[c.hue] * def.targetFrac) < 1e-9);
});

test('gathering each colour pure wins with legacy stars; sandbox never wins', () => {
  const s = new StageSimulation(setup(1));
  const cyan = s.core.drops;
  for (const d of cyan) { d.x = 210; d.y = 280; d.vx = d.vy = 0; }
  for (let i = 0; i < 60 && !s.won; i++) s.tick(1 / 60);
  assert.ok(s.won, 'stage 1 should clear');
  assert.equal(s.won!.stars, 3, 'a perfectly pure core earns three stars');
  const sandbox = new StageSimulation(setup(0));
  for (let i = 0; i < 120; i++) sandbox.tick(1 / 60);
  assert.equal(sandbox.won, null);
});

test('mix rule and sandbox count are honoured', () => {
  assert.equal(new StageSimulation({ ...setup(2), mix: 'legacy' }).core.fusionPolicy, 'legacy');
  assert.equal(new StageSimulation(setup(2)).core.fusionPolicy, 'held-press');
  assert.equal(new StageSimulation({ ...setup(0), sandboxCount: 24 }).core.drops.length, 24);
  assert.equal(clampSandboxCount(100), 60);
  assert.equal(clampSandboxCount(13), 12);
  assert.equal(clampSandboxCount(Number.NaN), 60);
});

test('nothing fuses before the player touches it (except the flowing stage 6)', () => {
  for (const scale of ['large', 'original'] as const) for (const id of STAGE_IDS.filter(i => i !== 6)) {
    const s = new StageSimulation(setup(id, scale));
    const n = s.core.drops.length;
    for (let i = 0; i < 300; i++) s.tick(1 / 60);
    assert.equal(s.core.drops.length, n, `${scale} stage ${id}`);
  }
});
