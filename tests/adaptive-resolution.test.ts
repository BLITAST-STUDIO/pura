import assert from 'node:assert/strict';
import test from 'node:test';
import { AdaptiveResolution, RESOLUTION_STEPS } from '../src/experiments/fusion-lab/adaptive-resolution';

const frames = (ms: number, n = 60, jitter = 0.3) => Array.from({ length: n }, (_, i) => ms + (i % 2 ? jitter : -jitter));

test('late frames step the resolution down one level at a time, with a cooldown', () => {
  const a = new AdaptiveResolution();
  assert.equal(a.window(frames(24)), 'down');
  assert.equal(a.level, 1);
  assert.equal(a.window(frames(24)), 'hold', 'cooldown');
  assert.equal(a.window(frames(24)), 'hold', 'cooldown');
  assert.equal(a.window(frames(24)), 'down');
  for (let i = 0; i < 20; i++) a.window(frames(40));
  assert.equal(a.level, RESOLUTION_STEPS.length - 1, 'stops at the lowest step');
  assert.equal(a.pixelRatio(3), 1);
});

test('a smooth device keeps the sharpest step and never exceeds its own ratio', () => {
  const a = new AdaptiveResolution();
  for (let i = 0; i < 30; i++) assert.equal(a.window(frames(16.7)), 'hold');
  assert.equal(a.level, 0);
  assert.equal(a.pixelRatio(3), 1.75);
  assert.equal(a.pixelRatio(1), 1);
  assert.equal(a.pixelRatio(Number.NaN), 1);
});

test('a 30 Hz cap (low-power mode) is not mistaken for load', () => {
  const a = new AdaptiveResolution();
  for (let i = 0; i < 20; i++) assert.equal(a.window(frames(33.4, 30, 0.2), frames(4, 30)), 'hold');
  assert.equal(a.level, 0);
});

test('overloaded frames snapped to 33 ms by a 60 Hz display still step down', () => {
  const a = new AdaptiveResolution();
  assert.equal(a.window(frames(33.4, 30, 0.2), frames(24, 30)), 'down');
});

test('after a stable stretch it probes back up; a failed probe doubles the wait', () => {
  const a = new AdaptiveResolution();
  a.window(frames(24)); // level 1
  let windows = 0;
  while (a.window(frames(16.7)) !== 'up') windows++;
  assert.equal(a.level, 0);
  const firstWait = windows;
  a.window(frames(16.7)); a.window(frames(16.7)); // cooldown after the probe
  assert.equal(a.window(frames(24)), 'down', 'the probe was too sharp');
  windows = 0;
  while (a.window(frames(16.7)) !== 'up') { windows++; if (windows > 200) break; }
  assert.ok(windows > firstWait * 1.5, `backoff: ${windows} vs ${firstWait}`);
});

test('too few samples (a hidden tab) decide nothing', () => {
  const a = new AdaptiveResolution();
  assert.equal(a.window([50, 50, 50]), 'hold');
  assert.equal(a.level, 0);
});
