import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAUSTIC_BALANCED_SAMPLES, CAUSTIC_SAMPLES, projectedCausticGeometry, projectedPointSize } from '../src/experiments/droplet-lab/projected-caustic';

test('lighter rendering still samples the entire droplet instead of only its center', () => {
  const geometry = projectedCausticGeometry();
  const positions = geometry.getAttribute('position');
  assert.equal(positions.count, CAUSTIC_SAMPLES);
  for (const count of [CAUSTIC_BALANCED_SAMPLES, CAUSTIC_SAMPLES]) {
    const quadrants = [0, 0, 0, 0], rings = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      const radius = Math.hypot(x, y);
      assert.ok(Number.isFinite(radius) && radius <= 1.32);
      quadrants[(x < 0 ? 1 : 0) + (y < 0 ? 2 : 0)]++;
      rings[radius < .44 ? 0 : radius < .88 ? 1 : 2]++;
    }
    assert.ok(quadrants.every(n => n > count * .2));
    assert.ok(rings.every(n => n > count * .08));
  }
  geometry.dispose();
});

test('projected light splats remain finite and bounded on small and large viewports', () => {
  for (const radius of [1, 18, 60, 400]) for (const dpr of [1, 2, 3]) {
    for (const count of [CAUSTIC_BALANCED_SAMPLES, CAUSTIC_SAMPLES]) {
      const size = projectedPointSize(radius, dpr, count);
      assert.ok(size >= 3 && size <= 40);
    }
  }
});
