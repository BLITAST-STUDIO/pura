import assert from 'node:assert/strict';
import test from 'node:test';
import { capLobes, MAX_LOBES, type Lobe } from '../src/experiments/fusion-lab/shape';

const lobe = (i: number, amount: number): Lobe => ({ x: i * 0.1, y: -i * 0.05, r: 0.3 + i * 0.01, absorption: [i, 1, 2], amount });

test('a rapid chain never exceeds the shader lobe capacity and keeps every bit of dye', () => {
  const many = Array.from({ length: 9 }, (_, i) => lobe(i, 100 + i * 10));
  const capped = capLobes(many);
  assert.equal(capped.length, MAX_LOBES);
  const sum = (ls: Lobe[]) => ls.reduce((n, l) => n + l.amount, 0);
  assert.equal(sum(capped), sum(many));
  const dye = (ls: Lobe[], c: number) => ls.reduce((n, l) => n + l.absorption[c] * l.amount, 0);
  for (const c of [0, 1, 2]) assert.ok(Math.abs(dye(capped, c) - dye(many, c)) < 1e-9, 'amount-weighted dye preserved');
  const area = (ls: Lobe[]) => ls.reduce((n, l) => n + l.r * l.r, 0);
  assert.ok(Math.abs(area(capped) - area(many)) < 1e-12, 'lobe area preserved');
  assert.equal(capLobes(many.slice(0, 5)).length, 5);
  assert.deepEqual(capLobes(many.slice(0, 2)), many.slice(0, 2));
});
