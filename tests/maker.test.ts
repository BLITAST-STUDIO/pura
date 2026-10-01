import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTER, cloneLayout, geometryKey, movePiece, readLayout, replacePiece } from '../src/experiments/maker/layout';
import { LayoutSimulation, MakerSimulation, STEP, verifiesClear } from '../src/experiments/maker/simulation';
import { decodeStage, encodeStage, stageUrl, sharedToken, readDraft, saveDraft, DRAFT_KEY, MAX_TOKEN } from '../src/experiments/maker/share';
import { routeKey } from '../src/route-key';

function clear(dt = STEP) {
  const sim = new MakerSimulation(STARTER);
  const d = sim.core.drops[0];
  assert.ok(sim.grab(d.id));
  sim.move(d.x - 52, d.y + 90.1); sim.release();
  for (let t = 0; t < 12 && !sim.result; t += dt) sim.tick(dt);
  assert.deepEqual(sim.result, { cleared: true, shots: 1 });
  return sim;
}
function token(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }

test('maker validates a bounded, separated, single-colour layout before playing', () => {
  assert.ok(readLayout(STARTER));
  assert.equal(readLayout({ ...STARTER, drops: [STARTER.drops[0]] }), null);
  assert.equal(readLayout({ ...STARTER, drops: Array(13).fill(STARTER.drops[0]) }), null);
  assert.equal(readLayout({ ...STARTER, stones: Array(4).fill({ x: 60, y: 60, r: 24 }) }), null);
  assert.equal(readLayout({ ...STARTER, drops: [{ x: NaN, y: 100, r: 20 }, STARTER.drops[1]] }), null);
  assert.equal(readLayout({ ...STARTER, drops: [{ x: 0, y: 100, r: 20 }, STARTER.drops[1]] }), null);
  assert.equal(readLayout({ ...STARTER, stones: [{ ...STARTER.drops[0], r: 32 }] }), null);
  assert.equal(replacePiece(STARTER, { kind: 'drop', index: 0 }, { r: 100 }), null);
  const moved = movePiece(STARTER, { kind: 'drop', index: 0 }, -100, 900)!;
  assert.equal(moved.drops[0].x, 50); assert.equal(moved.drops[0].y, 510);
  assert.equal(STARTER.drops[0].x, 130, 'editing does not mutate the original');
});

test('editing holds positions and sizes without launching or merging', () => {
  const sim = new LayoutSimulation(STARTER);
  const before = JSON.stringify(sim.core.drops);
  for (let i = 0; i < 600; i++) sim.tick(STEP);
  assert.equal(JSON.stringify(sim.core.drops), before);
  const edited = movePiece(STARTER, { kind: 'drop', index: 0 }, 110, 465)!;
  sim.setLayout(edited);
  assert.equal(sim.core.drops[0].x, 110);
  assert.equal(sim.core.drops.length, STARTER.drops.length);
});

test('clearing shots replay across rendering rates; cancelling does not create a proof', () => {
  const a = clear(1 / 30), b = clear(1 / 144);
  assert.deepEqual(a.proof, b.proof);
  assert.deepEqual(a.core.drops.map(d => [d.x, d.y, d.mass]), b.core.drops.map(d => [d.x, d.y, d.mass]));
  assert.ok(verifiesClear(STARTER, a.proof));
  const c = new MakerSimulation(STARTER), d = c.core.drops[0];
  c.grab(d.id); c.move(d.x + 80, d.y); c.abort();
  assert.equal(c.proof.length, 0); assert.equal(c.shots, 0);
  c.grab(d.id); c.move(d.x + 2, d.y); c.release();
  assert.equal(c.proof.length, 0); assert.equal(c.shots, 0);
});

test('shared links carry geometry, Unicode name and a verified clear, without other queries', () => {
  const layout = { ...cloneLayout(STARTER), name: '水の道 🌊' }, proof = clear().proof;
  const url = new URL(stageUrl('https://x.test/pura/next/?play=maker&sound=off', layout, proof)!);
  assert.equal(url.pathname, '/pura/next/'); assert.equal(url.search, '?play=maker');
  assert.equal(routeKey(url.search, false), 'play=maker');
  const decoded = decodeStage(sharedToken(url.hash)!)!;
  assert.equal(decoded.layout.name, layout.name);
  assert.equal(geometryKey(decoded.layout), geometryKey(layout));
  assert.deepEqual(decoded.proof, proof);
  assert.equal(encodeStage(STARTER, []), null, 'uncleared boards cannot be shared');
});

test('changing the stage, proof, version or bounds invalidates a clear link', () => {
  const proof = clear().proof;
  const changed = cloneLayout(STARTER); changed.drops[4] = { x: 60, y: 100, r: 20 };
  assert.ok(readLayout(changed)); assert.equal(encodeStage(changed, proof), null);
  assert.equal(decodeStage(token({ v: 99, l: STARTER, p: proof })), null);
  assert.equal(decodeStage(token({ v: 1, l: STARTER, p: [{ id: 999, dx: -52, dy: 90.1 }] })), null);
  assert.equal(decodeStage(token({ v: 1, l: STARTER, p: [{ id: 1000, dx: 1e8, dy: 90.1 }] })), null);
  assert.equal(decodeStage(token({ v: 1, l: STARTER, p: Array(13).fill(proof[0]) })), null);
  assert.equal(decodeStage('x'.repeat(MAX_TOKEN + 1)), null);
  assert.equal(decodeStage('%%%'), null); assert.equal(decodeStage(token([])), null);
});

test('draft storage is independent, validates on load and survives storage failures', () => {
  const values = new Map<string, string>([['pura-flow-hitofude-v2', 'previous-records']]);
  const store = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  assert.ok(saveDraft(store, STARTER)); assert.deepEqual(readDraft(store), STARTER);
  assert.equal(values.get('pura-flow-hitofude-v2'), 'previous-records');
  values.set(DRAFT_KEY, '{'); assert.equal(readDraft(store), null);
  assert.equal(saveDraft({ setItem() { throw Error('full'); } }, STARTER), false);
  assert.equal(readDraft({ getItem() { throw Error('denied'); } }), null);
});
