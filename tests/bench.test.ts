import assert from 'node:assert/strict';
import test from 'node:test';
import { BENCH_SCENARIOS, summarize } from '../src/experiments/bench/measure';

test('benchmark summary reports median, p95 and long frames; ignores junk intervals', () => {
  const intervals = [...Array(95).fill(16.7), 40, 40, 60, 70, 80, Number.NaN, -1];
  const r = summarize(BENCH_SCENARIOS[0], intervals, 12, { width: 780, height: 1040 });
  assert.equal(r.frames, 100);
  assert.equal(r.medianMs, 16.7);
  assert.equal(r.fps, 60);
  assert.equal(r.p95Ms, 40);
  assert.equal(r.over33, 5);
  assert.equal(r.over50, 3);
  assert.equal(summarize(BENCH_SCENARIOS[0], [], 0, { width: 1, height: 1 }).fps, 0);
});

test('the plan covers 12, 24 and 60 drops at both qualities', () => {
  assert.ok(BENCH_SCENARIOS.some(s => s.count === 60 && s.quality === 'auto'), 'and the adaptive row');
  for (const count of [12, 24, 60]) for (const quality of ['high', 'balanced']) {
    assert.ok(BENCH_SCENARIOS.some(s => s.count === count && s.quality === quality));
  }
});
