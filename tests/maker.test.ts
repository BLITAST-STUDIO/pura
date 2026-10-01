import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTER, STONE_SHAPES, TONES, cloneLayout, geometryKey, movePiece, readLayout, replacePiece, shapeOf, toneOf, turned } from '../src/experiments/maker/layout';
import { LayoutSimulation, MakerSimulation, MAX_STEPS, STEP, verifiesClear, type RecordedShot } from '../src/experiments/maker/simulation';
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

/** Two far pairs; the first pair's shot is still rolling when the second pair's shot is made, then the two fused drops meet. */
const PAIRS = readLayout({ name: '連続', stones: [], drops: [{ x: 70, y: 480, r: 26 }, { x: 70, y: 330, r: 20 }, { x: 350, y: 480, r: 26 }, { x: 350, y: 330, r: 20 }] })!;
/** Aim `id` at the target drop's centre with a pull of `pull`, from where things stand now. */
function shootAt(sim: MakerSimulation, id: number, targetId: number, pull = 70) {
  const a = sim.core.drops.find(d => d.id === id)!, b = sim.core.drops.find(d => d.id === targetId)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(sim.grab(id), `drop ${id} can be aimed`);
  sim.move(a.x - (b.x - a.x) / len * pull, a.y - (b.y - a.y) / len * pull); sim.release();
}
const runSteps = (sim: MakerSimulation, n: number, dt: number) => { const target = sim.steps + n; while (sim.steps < target && !sim.result && !sim.atRest) sim.tick(dt); };
/** Shoot the left pair, and 12 steps later (still rolling) the right pair; then play out and join the two. */
function overlapped(dt: number) {
  const sim = new MakerSimulation(PAIRS);
  shootAt(sim, 1001, 1000);
  runSteps(sim, 12, dt);
  const first = sim.core.drops.find(d => d.id === 1001)!;
  const rolling = Math.hypot(first.vx, first.vy), resting = sim.atRest;
  shootAt(sim, 1003, 1002);
  for (let i = 0; i < 120 * 10 && !sim.atRest; i++) sim.tick(dt);
  const left = sim.core.drops.find(d => d.x < 210)!, right = sim.core.drops.find(d => d.x >= 210)!;
  if (sim.core.drops.length === 2) shootAt(sim, left.id, right.id, 120);
  for (let i = 0; i < 120 * 12 && !sim.result && !sim.atRest; i++) sim.tick(dt);
  return { sim, rolling, resting };
}

test('a second drop can be shot while the first is still rolling; the drop in motion cannot be caught', () => {
  const sim = new MakerSimulation(PAIRS);
  shootAt(sim, 1001, 1000);
  runSteps(sim, 12, STEP);
  assert.ok(!sim.atRest, 'the board is moving');
  assert.equal(sim.grab(1001), false, 'the sliding drop itself cannot be aimed');
  assert.ok(sim.grab(1003), 'a still drop can, whatever else is moving');
  sim.abort();
});

test('overlapped shots are recorded with their steps and replay exactly, whatever the frame rate', () => {
  const runs = [1 / 120, 1 / 60, 1 / 30].map(overlapped);
  for (const { sim, rolling, resting } of runs) {
    assert.ok(!resting && rolling > 30, `the first shot was still moving (${rolling.toFixed(0)}) at the second`);
    assert.deepEqual(sim.result, { cleared: true, shots: 3 });
    assert.ok(sim.proof[1].g! >= sim.proof[0].r! && sim.proof[1].g! < sim.proof[0].r! + 60, 'the second grab came right after the first release');
    assert.ok(verifiesClear(PAIRS, sim.proof), 'the proof replays to a clear');
  }
  assert.deepEqual(runs[1].sim.proof, runs[0].sim.proof, 'the recorded steps do not depend on the frame rate');
  assert.deepEqual(runs[2].sim.proof, runs[0].sim.proof);
  assert.deepEqual(runs[2].sim.core.drops.map(d => [d.x, d.y, d.mass]), runs[0].sim.core.drops.map(d => [d.x, d.y, d.mass]));
  const url = new URL(stageUrl('https://x.test/pura/next/', PAIRS, runs[0].sim.proof)!);
  assert.deepEqual(decodeStage(sharedToken(url.hash)!)!.proof, runs[0].sim.proof);
});

test('overlapped proofs are rejected when the steps are impossible, and version 1 links still open', () => {
  const proof = overlapped(STEP).sim.proof as RecordedShot[];
  const edit = (i: number, patch: Partial<RecordedShot>) => proof.map((s, k) => (k === i ? { ...s, ...patch } : s));
  assert.equal(verifiesClear(PAIRS, edit(1, { g: proof[0].r! - 1 })), false, 'grabbed before the last release');
  assert.equal(verifiesClear(PAIRS, edit(1, { r: proof[1].g! - 1 })), false, 'released before it was grabbed');
  assert.equal(verifiesClear(PAIRS, edit(2, { r: MAX_STEPS + 1 })), false, 'beyond the bounded replay');
  assert.equal(verifiesClear(PAIRS, edit(0, { g: 0.5 })), false, 'steps are whole numbers');
  assert.equal(verifiesClear(PAIRS, proof.map(({ id, dx, dy }) => ({ id, dx, dy }))), false, 'a version 2 link needs its steps');
  assert.equal(verifiesClear(PAIRS, edit(1, { dx: -proof[1].dx, dy: -proof[1].dy })), false, 'a clear that does not happen is not a clear');
  assert.ok(verifiesClear(PAIRS, edit(1, { g: proof[1].g! + 400, r: proof[1].r! + 400 }).map((s, k) => (k === 2 ? { ...s, g: s.g! + 400, r: s.r! + 400 } : s))), 'the same shots made later, when everything has settled, are also a clear');
  const legacy = clear().proof.map(({ id, dx, dy }) => ({ id, dx, dy }));
  assert.ok(decodeStage(token({ v: 1, l: STARTER, p: legacy })), 'old links open');
  assert.equal(decodeStage(token({ v: 2, l: STARTER, p: legacy })), null, 'a new link without steps does not');
});

test('board colours: seven choices, white is the default and unwritten, unknown ones fall back, geometry is untouched', () => {
  assert.deepEqual(TONES.map(t => t.id), ['white', 'mint', 'sakura', 'lavender', 'lemon', 'sky', 'peach']);
  assert.equal(readLayout(STARTER)!.tone, undefined, 'a layout without a colour is white');
  assert.equal(readLayout({ ...STARTER, tone: 'white' })!.tone, undefined, 'white is not written');
  assert.equal(readLayout({ ...STARTER, tone: 'sakura' })!.tone, 'sakura');
  assert.equal(readLayout({ ...STARTER, tone: 'hot-pink' })!.tone, undefined, 'an unknown colour is white, not an error');
  assert.equal(readLayout({ ...STARTER, tone: { x: 1 } })!.tone, undefined);
  assert.equal(toneOf(undefined).id, 'white'); assert.equal(toneOf('mint').floor, '#c8feda');
  assert.equal(cloneLayout({ ...STARTER, tone: 'sky' }).tone, 'sky');
  for (const t of TONES.slice(1)) assert.match(t.floor!, /^#[0-9a-f]{6}$/);
  // The colour does not belong to the geometry a clear certificate covers.
  assert.equal(geometryKey({ ...STARTER, tone: 'peach' }), geometryKey(STARTER));
});

test('a shared stage carries its board colour; links made before colours existed open white', () => {
  const layout = { ...cloneLayout(STARTER), tone: 'lavender' as const }, proof = clear().proof;
  const url = stageUrl('https://x.test/pura/next/', layout, proof)!;
  const decoded = decodeStage(sharedToken(new URL(url).hash)!)!;
  assert.equal(decoded.layout.tone, 'lavender');
  assert.ok(verifiesClear(decoded.layout, decoded.proof), 'the colour changes nothing about the clear');
  assert.equal(encodeStage({ ...STARTER, tone: 'mint' }, proof), encodeStage({ ...STARTER, tone: 'mint' }, proof));
  const plain = decodeStage(encodeStage(STARTER, proof)!)!;
  assert.equal(plain.layout.tone, undefined);
  assert.ok(encodeStage(STARTER, proof)!.length < encodeStage(layout, proof)!.length, 'white adds nothing to the link');
  // A draft keeps its colour.
  const values = new Map<string, string>();
  const store = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  assert.ok(saveDraft(store, layout)); assert.equal(readDraft(store)!.tone, 'lavender');
});

test('stone shapes: circle, triangle, square, hexagon; strict sides and angles; turning repeats; geometry includes the shape', () => {
  assert.deepEqual(STONE_SHAPES.map(s => s.id), ['circle', 'triangle', 'square', 'hexagon']);
  const stoned = (stone: object) => readLayout({ ...STARTER, stones: [{ x: 300, y: 300, r: 32, ...stone }] });
  assert.ok(stoned({})); assert.equal(shapeOf(stoned({})!.stones[0]), 'circle');
  assert.equal(shapeOf(stoned({ n: 3, a: 30 })!.stones[0]), 'triangle');
  assert.deepEqual(stoned({ n: 4, a: 45 })!.stones[0], { x: 300, y: 300, r: 32, n: 4, a: 45 }, 'a square at 45° (axis-aligned) is kept as is');
  assert.deepEqual(stoned({ n: 6 })!.stones[0], { x: 300, y: 300, r: 32, n: 6, a: 0 }, 'the angle defaults to 0');
  for (const bad of [{ n: 5, a: 0 }, { n: 2, a: 0 }, { n: 4, a: 10 }, { n: 4, a: 90 }, { n: 3, a: 120 }, { n: 3, a: 270 }, { n: 4, a: 7.5 }, { n: 6, a: -15 }, { a: 15 }, { n: '4' }, { n: 4, a: NaN }]) {
    assert.equal(stoned(bad), null, `rejected: ${JSON.stringify(bad)}`);
  }
  // Turning is in 15° steps and repeats after a full turn divided by the sides.
  assert.equal(turned({ x: 0, y: 0, r: 24, n: 4, a: 75 }).a, 0, 'a square repeats every 90°');
  assert.equal(turned({ x: 0, y: 0, r: 24, n: 3, a: 105 }).a, 0, 'a triangle repeats every 120°');
  assert.equal(turned({ x: 0, y: 0, r: 24, n: 6, a: 0 }, 3).a, 45);
  assert.equal(turned({ x: 0, y: 0, r: 24 }).a, undefined, 'a circle has nothing to turn');
  // The shape is part of the geometry (a clear on a square does not hold for a triangle).
  const square = stoned({ n: 4, a: 45 })!, circle = stoned({})!;
  assert.notEqual(geometryKey(square), geometryKey(circle));
  const swapped = replacePiece(circle, { kind: 'stone', index: 0 }, { n: 3, a: 30 })!;
  assert.equal(shapeOf(swapped.stones[0]), 'triangle');
  const back = replacePiece(swapped, { kind: 'stone', index: 0 }, { n: undefined, a: undefined })!;
  assert.deepEqual(back.stones[0], circle.stones[0], 'back to a circle');
  assert.deepEqual(movePiece(square, { kind: 'stone', index: 0 }, 310, 310)!.stones[0], { x: 310, y: 310, r: 32, n: 4, a: 45 }, 'moving keeps the shape');
});

test('a stage with polygon stones plays, proves and shares like any other', () => {
  const layout = readLayout({ name: '角', tone: 'mint', stones: [{ x: 330, y: 330, r: 24, n: 4, a: 45 }, { x: 90, y: 250, r: 24, n: 3, a: 30 }], drops: STARTER.drops })!;
  const sim = new MakerSimulation(layout);
  assert.equal(sim.core.obstacles.length, 2);
  assert.equal(sim.core.obstacles[0].n, 4, 'the polygon reaches the physics');
  // Aim a drop through the board at the square, and check it never ends inside it.
  const d = sim.core.drops[0];
  assert.ok(sim.grab(d.id)); sim.move(d.x - 40, d.y + 90); sim.release();
  for (let i = 0; i < 120 * 6; i++) sim.tick(STEP);
  assert.ok(sim.proof.length === 1, 'the shot was recorded');
  // Shapes survive a link (a fake clearing proof is rejected, but the layout itself round-trips through the reader).
  assert.deepEqual(readLayout(JSON.parse(JSON.stringify(layout)))!.stones, layout.stones);
});
