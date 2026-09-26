import assert from 'node:assert/strict';
import test from 'node:test';
import { CurlingSimulation, endScore, ENDS, HOUSE, STONE_R, STONES_PER_END, type Team } from '../src/experiments/curling/simulation';
import { Planner, positionValue } from '../src/experiments/curling/ai';
import { emptyPigment } from '../src/game/palette';
import type { Drop } from '../src/game/sim';

const UP = -Math.PI / 2;
let nextId = 100;
function at(team: Team, x: number, y: number, r = STONE_R): Drop {
  const pigment = emptyPigment(); pigment[team] = r * r;
  return { id: nextId++, x, y, vx: 0, vy: 0, r, renderR: r, mass: r * r, pigment, freshness: 0 };
}
/** Distance from the button to a drop's nearest edge, as curling measures. */
const edge = (d: Drop) => Math.max(0, Math.hypot(d.x - HOUSE.x, d.y - HOUSE.y) - d.r);

test('the count: the closest side scores each drop closer than the other side\'s closest', () => {
  const B = HOUSE;
  assert.deepEqual(endScore([at('cyan', B.x, B.y), at('cyan', B.x + 40, B.y), at('rose', B.x - 60, B.y)]), { team: 'cyan', points: 2 });
  assert.deepEqual(endScore([at('cyan', B.x, B.y + 30), at('rose', B.x, B.y), at('cyan', B.x + 90, B.y)]), { team: 'rose', points: 1 });
  assert.deepEqual(endScore([at('rose', B.x, B.y + B.r + STONE_R - 1)]), { team: 'rose', points: 1 }, 'touching the house counts');
  assert.deepEqual(endScore([at('rose', B.x, B.y + B.r + STONE_R + 1)]), { team: null, points: 0 }, 'outside is a blank end');
  assert.deepEqual(endScore([]), { team: null, points: 0 });
});

test('weight: about 0.6 draws to the button; too light is short of the hog line; too hard goes out', () => {
  const draw = new CurlingSimulation(); draw.shoot(UP, 0.6); draw.settle();
  const d = draw.core.drops.find(d => d.pigment.cyan > 0)!;
  assert.ok(edge(d) < 36, `inside the four-foot ring (edge ${edge(d).toFixed(0)})`);
  const light = new CurlingSimulation(); light.shoot(UP, 0.35); light.settle();
  assert.equal(light.note, 'hog'); assert.equal(light.core.drops.filter(d => d.pigment.cyan > 0).length, 0);
  const hard = new CurlingSimulation(); hard.shoot(UP, 1); hard.settle();
  assert.equal(hard.note, 'out'); assert.equal(hard.core.drops.filter(d => d.pigment.cyan > 0).length, 0);
});

test('an end: the side without the hammer throws first, sides alternate, then the end is counted', () => {
  const sim = new CurlingSimulation();
  assert.equal(sim.hammer, 'rose'); assert.equal(sim.turn, 'cyan');
  const order: Team[] = [];
  for (let i = 0; i < STONES_PER_END * 2; i++) { order.push(sim.turn); sim.shoot(UP + (i % 3 - 1) * 0.05, 0.55); sim.settle(); }
  assert.deepEqual(order, ['cyan', 'rose', 'cyan', 'rose', 'cyan', 'rose', 'cyan', 'rose']);
  assert.equal(sim.phase, 'scored');
  assert.ok(sim.lastEnd);
});

test('the hammer passes to the side that did not score; a blank end keeps it', () => {
  const sim = new CurlingSimulation();
  sim.phase = 'scored'; sim.lastEnd = { team: 'rose', points: 1 }; sim.ends = [sim.lastEnd];
  sim.nextEnd();
  assert.equal(sim.hammer, 'cyan'); assert.equal(sim.turn, 'rose'); assert.equal(sim.end, 2);
  sim.phase = 'scored'; sim.lastEnd = { team: null, points: 0 }; sim.ends.push(sim.lastEnd);
  sim.nextEnd();
  assert.equal(sim.hammer, 'cyan', 'blank end');
});

test('the game ends after the last end, with one extra end on a tie', () => {
  const sim = new CurlingSimulation();
  const finish = (result: { team: Team | null; points: number }) => { sim.phase = 'scored'; sim.lastEnd = result; sim.ends.push(result); sim.nextEnd(); };
  for (let i = 0; i < ENDS - 1; i++) finish({ team: null, points: 0 });
  finish({ team: null, points: 0 });
  assert.equal(sim.phase, 'aim', 'tied after the last end: an extra end');
  finish({ team: 'cyan', points: 1 });
  assert.equal(sim.winner, 'cyan');
});

test('drops of one colour fuse into one larger drop, which counts once', () => {
  const sim = new CurlingSimulation();
  sim.core.drops.push(at('cyan', HOUSE.x, HOUSE.y + 60));
  sim.shoot(UP, 0.62); sim.settle();
  const cyan = sim.core.drops.filter(d => d.pigment.cyan > 0);
  assert.equal(cyan.length, 1);
  assert.ok(cyan[0].r > STONE_R * 1.3);
  assert.deepEqual(endScore(sim.core.drops), { team: 'cyan', points: 1 });
});

test('a hard straight shot takes out the other colour sitting on the button', () => {
  const sim = new CurlingSimulation();
  sim.core.drops.push(at('rose', HOUSE.x, HOUSE.y));
  sim.shoot(UP, 1); sim.settle();
  const rose = sim.core.drops.filter(d => d.pigment.rose > 0);
  assert.ok(rose.length === 0 || edge(rose[0]) > HOUSE.r, 'the rose drop is gone from the house');
});

test('only the sides a person plays answer to touch', () => {
  const sim = new CurlingSimulation();
  sim.control = ['cyan'];
  assert.ok(sim.grab(sim.delivery!)); sim.abort();
  sim.shoot(UP, 0.55); sim.settle();
  assert.equal(sim.turn, 'rose');
  assert.equal(sim.grab(sim.delivery!), false, 'the computer\'s drop');
});

test('the computer finds a shot that scores on an empty sheet and answers a stone on the button', () => {
  let seed = 7; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const empty = new CurlingSimulation();
  const planner = new Planner(empty, random); while (!planner.step(100));
  const copy = empty.lookahead(); copy.shoot(planner.best!.angle, planner.best!.power); copy.settle();
  assert.equal(endScore(copy.core.drops).team, 'cyan');
  // Rose to play against a cyan drop on the button: its best leaves rose ahead.
  const sim = new CurlingSimulation();
  sim.shoot(UP, 0.6); sim.settle();
  const against = new Planner(sim, random); while (!against.step(100));
  const after = sim.lookahead(); after.shoot(against.best!.angle, against.best!.power); after.settle();
  assert.ok(positionValue(after.core.drops, 'rose') > positionValue(sim.core.drops, 'rose'));
});
