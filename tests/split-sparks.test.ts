import assert from 'node:assert/strict';
import test from 'node:test';
import { SPARK_CAPACITY, SPARK_LIFE, SplitSparks } from '../src/experiments/fusion-lab/split-sparks';

test('a split sprays a few beads toward the separated drop, which fade within half a second', () => {
  const sparks = new SplitSparks();
  sparks.burst({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.3, [0.9, 0.5, 0.2]);
  assert.ok(sparks.alive > 0 && sparks.alive <= 12);
  const position = new Float32Array(SPARK_CAPACITY * 3), color = new Float32Array(SPARK_CAPACITY * 3), fade = new Float32Array(SPARK_CAPACITY * 2);
  for (let i = 0; i < 6; i++) sparks.update(1 / 60);
  const count = sparks.fill(position, color, fade);
  let forward = 0;
  for (let i = 0; i < count; i++) {
    if (position[i * 3] > 0.27) forward++;
    assert.ok(position[i * 3 + 2] > 0, 'beads stay above the floor');
    assert.ok(fade[i * 2] >= 0 && fade[i * 2] <= 1);
    assert.equal(color[i * 3], Math.fround(0.9));
  }
  assert.equal(forward, count, 'every bead leaves on the child side of the rim');
  for (let i = 0; i < Math.ceil(SPARK_LIFE * 60) + 1; i++) sparks.update(1 / 60);
  assert.equal(sparks.alive, 0);
});

test('bursts never exceed the pool, and clearing empties it', () => {
  const sparks = new SplitSparks();
  for (let i = 0; i < 40; i++) sparks.burst({ x: 0, y: 0 }, { x: 0, y: 1 }, 0.3, [1, 1, 1]);
  assert.equal(sparks.alive, SPARK_CAPACITY);
  sparks.clear();
  assert.equal(sparks.alive, 0);
  sparks.update(Number.NaN);
  assert.equal(sparks.alive, 0);
});
