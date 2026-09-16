import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { SphereGeometry, Vector3 } from 'three';
import {
  SURFACE_BOTTOM, SURFACE_CENTER_Z, SURFACE_HEIGHT, SURFACE_TOP,
  warpSurface, unwarpSurface, surfaceField, surfaceGradient, surfaceExit,
  type Bend, type Point3,
} from '../src/experiments/droplet-lab/surface-shape';

const MAX_BEND = 0.065;
const bends: Bend[] = [{ x: 0, y: 0 }, ...Array.from({ length: 8 }, (_, i) => ({
  x: MAX_BEND * Math.cos(i * Math.PI / 4), y: MAX_BEND * Math.sin(i * Math.PI / 4),
}))];
const audit: Record<string, unknown> = {
  description: 'Independent numeric geometry checks; not a GPU benchmark or perceptual evaluation.',
  bendLimit: MAX_BEND,
  geometry: 'SphereGeometry(1, 96, 64); z = max(0.007, (z + 0.64) * 0.62)',
  limitations: [
    'CPU double-precision reference validates the 16-step algorithm; GPU float precision and shader compilation need browser verification.',
    'Signed volume covers the local nonlinear shear on the actual Float32 mesh; world-space scaling is outside these tests.',
    'A finite ray set includes grazing rays and one TIR reflection; this does not test unlimited internal bounces.',
    'No smartphone timing, input latency, or human material/touch judgment is inferred.',
  ],
};
after(() => {
  if (process.env.SURFACE_AUDIT_REPORT === '1') {
    const sections = ['inverseAndJacobian', 'normals', 'meshVolume', 'convexity', 'opticalExits', 'contactRim'];
    audit.result = { expectedChecks: sections.length, completedChecks: sections.filter(key => key in audit).length,
      status: sections.every(key => key in audit) ? 'passed' : 'incomplete or failed' };
    writeFileSync(new URL('../artifacts/m1/research-shape.json', import.meta.url), `${JSON.stringify(audit, null, 2)}\n`);
  }
});

const vector = (p: Point3) => new Vector3(p.x, p.y, p.z);
const distance = (a: Point3, b: Point3) => vector(a).distanceTo(vector(b));
function pointOnCap(z: number, angle: number): Point3 {
  const radius = Math.sqrt(Math.max(0, 1 - ((z - SURFACE_CENTER_Z) / SURFACE_HEIGHT) ** 2));
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z };
}
function signedVolume(positions: Float32Array, indices: ArrayLike<number>): number {
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    volume += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      + positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return volume / 6;
}

test('height shear is invertible, fixes the entire contact disk, and has unit local volume', () => {
  let maxRoundtrip = 0, maxDeterminantError = 0;
  for (const bend of bends) {
    for (let iz = 0; iz <= 12; iz++) for (let i = 0; i < 16; i++) {
      const p = pointOnCap(SURFACE_BOTTOM + (SURFACE_TOP - SURFACE_BOTTOM) * iz / 12, i * Math.PI / 8);
      const warped = warpSurface(p, bend);
      maxRoundtrip = Math.max(maxRoundtrip, distance(unwarpSurface(warped, bend), p));
      if (iz === 0) assert.deepEqual(warped, p, 'the full contact ring must stay fixed');
      const columns = (['x', 'y', 'z'] as const).map(axis => {
        const h = 1e-5;
        const high = warpSurface({ ...p, [axis]: p[axis] + h }, bend);
        const low = warpSurface({ ...p, [axis]: p[axis] - h }, bend);
        return vector(high).sub(vector(low)).multiplyScalar(1 / (2 * h));
      });
      const det = columns[0].dot(columns[1].clone().cross(columns[2]));
      maxDeterminantError = Math.max(maxDeterminantError, Math.abs(det - 1));
    }
    for (const p of [{ x: 0, y: 0, z: SURFACE_BOTTOM }, { x: 0.3, y: -0.2, z: SURFACE_BOTTOM }]) {
      assert.deepEqual(warpSurface(p, bend), p);
    }
  }
  assert.ok(maxRoundtrip < 5e-16);
  assert.ok(maxDeterminantError < 5e-10);
  audit.inverseAndJacobian = { maxRoundtrip, maxDeterminantError, sampledPoints: bends.length * 13 * 16 };
});

test('surface normals agree with finite differences and the cross product of warped surface tangents', () => {
  let maxGradientError = 0, maxNormalAngle = 0;
  for (const bend of bends) for (let iz = 1; iz < 12; iz++) for (let i = 0; i < 16; i++) {
    const z = SURFACE_BOTTOM + (SURFACE_TOP - SURFACE_BOTTOM) * iz / 12;
    const angle = i * Math.PI / 8;
    const p = warpSurface(pointOnCap(z, angle), bend);
    const analytic = vector(surfaceGradient(p, bend));
    const h = 1e-5;
    const finite = new Vector3(...(['x', 'y', 'z'] as const).map(axis => (
      surfaceField({ ...p, [axis]: p[axis] + h }, bend)
      - surfaceField({ ...p, [axis]: p[axis] - h }, bend)
    ) / (2 * h)));
    maxGradientError = Math.max(maxGradientError, analytic.distanceTo(finite));
    const tangentAngle = vector(warpSurface(pointOnCap(z, angle + h), bend))
      .sub(vector(warpSurface(pointOnCap(z, angle - h), bend)));
    const tangentHeight = vector(warpSurface(pointOnCap(z + h, angle), bend))
      .sub(vector(warpSurface(pointOnCap(z - h, angle), bend)));
    const geometricNormal = tangentAngle.cross(tangentHeight).normalize();
    const cosine = analytic.normalize().dot(geometricNormal);
    maxNormalAngle = Math.max(maxNormalAngle, Math.acos(Math.min(1, cosine)));
    assert.ok(cosine > 1 - 1e-10, 'the field normal must point outwards and follow the actual warped cap');
  }
  assert.ok(maxGradientError < 1e-8);
  audit.normals = { maxGradientError, maxNormalAngleRadians: maxNormalAngle, sampledPoints: bends.length * 11 * 16 };
});

test('the actual Float32 render mesh keeps its signed volume under every maximum bend direction', () => {
  const geometry = new SphereGeometry(1, 96, 64);
  const original = new Float32Array(geometry.attributes.position.array);
  for (let i = 2; i < original.length; i += 3) original[i] = Math.max(SURFACE_BOTTOM, (original[i] + 0.64) * SURFACE_HEIGHT);
  const indices = geometry.index!.array;
  const baseline = signedVolume(original, indices);
  assert.ok(baseline > 2, 'orientation and clipping should produce a closed, positive-volume drop');
  let maxRelativeVolumeError = 0;
  for (const bend of bends) {
    const warped = new Float32Array(original.length);
    for (let i = 0; i < original.length; i += 3) {
      const p = warpSurface({ x: original[i], y: original[i + 1], z: original[i + 2] }, bend);
      warped.set([p.x, p.y, p.z], i);
    }
    maxRelativeVolumeError = Math.max(maxRelativeVolumeError, Math.abs(signedVolume(warped, indices) / baseline - 1));
  }
  geometry.dispose();
  assert.ok(maxRelativeVolumeError < 1e-7, 'a visible surface bend must not pump volume into the triangulated drop');
  audit.meshVolume = { baseline, maxRelativeVolumeError, vertices: original.length / 3, triangles: indices.length / 3 };
});

test('the maximum shear preserves convexity, including the clipped contact boundary', () => {
  // For every horizontal direction u, the boundary is
  // u·xy <= (u·bend)(z-bottom)^2 + sqrt(1-((z-center)/height)^2).
  // The right side has second derivative <= 2|bend| - 1/height^2.
  // Its hypograph is convex; intersecting all directions and z >= bottom is convex.
  const curvatureMargin = 1 / SURFACE_HEIGHT ** 2 - 2 * MAX_BEND;
  assert.ok(curvatureMargin > 2.4);
  let largestField = -Infinity;
  for (const bend of bends) {
    const points = Array.from({ length: 48 }, (_, i) => warpSurface(
      pointOnCap(SURFACE_BOTTOM + (SURFACE_TOP - SURFACE_BOTTOM) * (i % 8) / 7, i * 2.3999632297), bend));
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      for (const t of [0.1, 0.5, 0.9]) {
        const middle = vector(points[i]).lerp(vector(points[j]), t);
        largestField = Math.max(largestField, surfaceField(middle, bend));
        assert.ok(middle.z >= SURFACE_BOTTOM - 1e-12 && surfaceField(middle, bend) <= 1e-12);
      }
    }
  }
  audit.convexity = { sufficientCondition: '2 * |bend| < 1 / height^2', curvatureMargin, largestSampledSegmentField: largestField };
});

// Independent high-precision oracle: expand the ray/shape intersection into a
// quartic, bracket by physical distance (not the shader AABB), and intersect
// the bottom plane explicitly. The input ray is intentionally nonunit.
function preciseExit(origin: Point3, ray: Point3, bend: Bend) {
  const h = origin.z - SURFACE_BOTTOM;
  const components = [
    [origin.x - bend.x * h * h, ray.x - 2 * bend.x * h * ray.z, -bend.x * ray.z * ray.z],
    [origin.y - bend.y * h * h, ray.y - 2 * bend.y * h * ray.z, -bend.y * ray.z * ray.z],
    [(origin.z - SURFACE_CENTER_Z) / SURFACE_HEIGHT, ray.z / SURFACE_HEIGHT, 0],
  ];
  const coefficients = [-1, 0, 0, 0, 0];
  for (const q of components) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) coefficients[i + j] += q[i] * q[j];
  const field = (t: number) => coefficients.reduceRight((sum, coefficient) => sum * t + coefficient, 0);
  let lo = 0, hi = 4 / vector(ray).length();
  assert.ok(field(lo) < 1e-10 && field(hi) > 0);
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (field(mid) < 0) lo = mid; else hi = mid;
  }
  const curved = (lo + hi) / 2;
  const plane = ray.z < 0 ? (SURFACE_BOTTOM - origin.z) / ray.z : Infinity;
  const bottom = plane < curved;
  const travel = Math.min(plane, curved);
  return { travel, bottom, point: vector(origin).addScaledVector(vector(ray), travel) };
}

test('bounded optical exits meet the cap or the contact plane for nonunit rays and internal reflections', () => {
  let count = 0, reflectionCount = 0, bottomCount = 0, maxPositionError = 0;
  const validate = (origin: Point3, ray: Point3, bend: Bend) => {
    const hit = surfaceExit(origin, ray, bend);
    assert.ok(hit, 'an interior ray must have a finite exit');
    const expected = preciseExit(origin, ray, bend);
    maxPositionError = Math.max(maxPositionError, distance(hit.point, expected.point));
    assert.ok(distance(hit.point, expected.point) < 4e-5);
    assert.equal(hit.bottom, expected.bottom, 'curved and flat interfaces must have the correct normal');
    assert.ok(vector(hit.normal).dot(vector(ray)) > 0, 'exit normal must face out of the body');
    if (hit.bottom) {
      bottomCount++;
      assert.ok(Math.abs(hit.point.z - SURFACE_BOTTOM) < 2e-5);
      assert.deepEqual(hit.normal, { x: 0, y: 0, z: -1 });
    } else assert.ok(Math.abs(surfaceField(hit.point, bend)) < 1e-4);
    count++;
    return hit;
  };
  for (const bend of bends) for (const z of [0.0072, 0.15, SURFACE_CENTER_Z, 0.85, SURFACE_TOP - 0.0002]) {
    for (let i = 0; i < 36; i++) {
      const radial = i % 3 === 0 ? 0.9998 : i % 3 === 1 ? 0.65 : 0;
      const seed = pointOnCap(z, i * 2.3999632297);
      const origin = warpSurface({ x: seed.x * radial, y: seed.y * radial, z }, bend);
      const direction = new Vector3(Math.cos(i * 1.731), Math.sin(i * 1.731), (i % 7 - 3) * 0.37).normalize();
      const ray = direction.clone().multiplyScalar([0.1, 1, 9][i % 3]);
      const hit = validate(origin, ray, bend);
      const normal = vector(hit.normal).normalize();
      const cosine = direction.dot(normal);
      if (1.333 ** 2 * (1 - cosine ** 2) > 1) {
        const reflected = direction.clone().reflect(normal);
        const secondOrigin = vector(hit.point).addScaledVector(reflected, 0.00015);
        assert.ok(surfaceField(secondOrigin, bend) < 0 && secondOrigin.z > SURFACE_BOTTOM);
        validate(secondOrigin, reflected.multiplyScalar(2.1), bend);
        reflectionCount++;
      }
    }
  }
  assert.ok(reflectionCount > 100 && bottomCount > 100);
  audit.opticalExits = { count, reflectionCount, bottomCount, maxPositionError, oracle: '70-iteration quartic root with independent physical-distance bracket plus exact plane intersection' };
});

test('a grazing curved exit immediately above the contact rim retains a curved outward normal', () => {
  const bend = { x: MAX_BEND, y: 0 };
  const target = warpSurface(pointOnCap(SURFACE_BOTTOM + 0.000025, 0), bend);
  const ray = { x: 1, y: 0, z: -0.05 };
  const origin = vector(target).addScaledVector(vector(ray), -0.2);
  const expected = preciseExit(origin, ray, bend);
  assert.equal(expected.bottom, false);
  const hit = surfaceExit(origin, ray, bend);
  assert.ok(hit);
  assert.equal(hit.bottom, false, 'proximity to the floor alone cannot determine which interface was hit');
  assert.ok(vector(hit.normal).normalize().x > 0.5);
  audit.contactRim = { regression: 'Fixed: floor proximity previously selected a bottom normal for a curved exit.',
    target, expectedPoint: expected.point, measuredPoint: hit.point, bottom: hit.bottom };
});
