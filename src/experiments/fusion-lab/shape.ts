import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { Absorption } from './composition';

export type Lobe = { x: number; y: number; r: number; absorption: Absorption; amount: number };
export const BOTTOM = .007;
/** Shader arrays (lobes, dye seeds) hold five entries. */
export const MAX_LOBES = 5;
/**
 * Rapid chains can combine more lobes than the shaders hold. Keep the largest
 * and fold the rest into one amount-weighted lobe, so no dye is lost.
 */
export function capLobes(lobes: Lobe[], max = MAX_LOBES): Lobe[] {
  if (lobes.length <= max) return lobes;
  const sorted = [...lobes].sort((a, b) => b.amount - a.amount);
  const kept = sorted.slice(0, max - 1), rest = sorted.slice(max - 1);
  const total = rest.reduce((n, l) => n + l.amount, 0);
  const w = (l: Lobe) => (total > 0 ? l.amount / total : 1 / rest.length);
  return [...kept, {
    x: rest.reduce((n, l) => n + l.x * w(l), 0),
    y: rest.reduce((n, l) => n + l.y * w(l), 0),
    r: Math.sqrt(rest.reduce((n, l) => n + l.r * l.r, 0)),
    absorption: [0, 1, 2].map(c => rest.reduce((n, l) => n + l.absorption[c] * w(l), 0)) as Absorption,
    amount: total,
  }];
}
const t = (BOTTOM - .3968) / .62;
export const UNIT_VOLUME = Math.PI * .62 * (2 / 3 - t + t ** 3 / 3);
export function smoothUnion(a: number, b: number, k: number) {
  const h = Math.max(0, Math.min(1, .5 + .5 * (b - a) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}
export function shapeField(x: number, y: number, z: number, lobes: Lobe[], k: number) {
  let distance = 1e5;
  for (const lobe of lobes) {
    // Math.hypot is several times slower than sqrt of squares in V8; this runs
    // for every grid cell of every merging drop, every frame.
    const ex = (x - lobe.x) / lobe.r, ey = (y - lobe.y) / lobe.r, ez = (z - .3968) / .62;
    const ellipsoid = (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * Math.min(lobe.r, .62);
    // smoothUnion inlined, with its exact flat cases (h = 0 or 1) short-circuited.
    const diff = ellipsoid - distance;
    if (diff >= k) continue;
    if (diff <= -k) { distance = ellipsoid; continue; }
    const h = .5 + .5 * diff / k;
    distance = ellipsoid * (1 - h) + distance * h - k * h * (1 - h);
  }
  return Math.max(distance, BOTTOM - z);
}
export function meshVolume(positions: THREE.BufferAttribute, count: number) {
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const ax = positions.getX(i), ay = positions.getY(i), az = positions.getZ(i);
    const bx = positions.getX(i + 1), by = positions.getY(i + 1), bz = positions.getZ(i + 1);
    const cx = positions.getX(i + 2), cy = positions.getY(i + 2), cz = positions.getZ(i + 2);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return Math.abs(volume / 6);
}
/** Finite mesh of a single union surface, including its closed floor. */
/**
 * Grid resolution for a merging drop of this board radius. Large drops keep
 * the original 40³; small ones need far fewer cells for the same on-screen detail.
 */
export function shapeResolution(radius: number) { return radius >= 50 ? 40 : radius >= 30 ? 32 : 24; }

export class FusionShape {
  private marcher: MarchingCubes;
  readonly geometry: THREE.BufferGeometry;
  constructor(readonly resolution = 40) {
    this.marcher = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 18000);
    this.geometry = this.marcher.geometry;
  }
  correction = 1;
  volume = UNIT_VOLUME;
  update(lobes: Lobe[], blend: number) {
    const n = this.marcher.resolution;
    const bound = Math.max(1.2, ...lobes.map(l => Math.max(Math.abs(l.x), Math.abs(l.y)) + l.r + blend)) * 1.18;
    this.marcher.isolation = 0;
    this.marcher.normal_cache.fill(0);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      this.marcher.field[x + y * n + z * n * n] = -shapeField((x / n * 2 - 1) * bound,
        (y / n * 2 - 1) * bound, (z / n * 2 - 1) * .75 + .5, lobes, blend);
    }
    this.marcher.update();
    const p = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = this.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const count = this.geometry.drawRange.count;
    for (let i = 0; i < count; i++) {
      p.setXYZ(i, p.getX(i) * bound, p.getY(i) * bound, p.getZ(i) * .75 + .5);
      const nx = normal.getX(i) / bound, ny = normal.getY(i) / bound, nz = normal.getZ(i) / .75;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normal.setXYZ(i, nx / len, ny / len, nz / len);
    }
    this.volume = meshVolume(p, count);
    this.correction = Math.sqrt(UNIT_VOLUME / this.volume);
    // Upload only the triangles drawn, not the whole 18000-triangle buffer.
    for (const attribute of [p, normal]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * 3);
      attribute.needsUpdate = true;
    }
    // Picking only needs a conservative bound; scanning the full buffer each frame is wasted work.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, .5), Math.hypot(bound * Math.SQRT2, .75));
  }
  dispose() { this.geometry.dispose(); (this.marcher.material as THREE.Material).dispose(); }
}

export const FIELD_GLSL = `
 uniform float uLobeCount;
 uniform vec4 uLobes[5];
 uniform float uBlend;
 float field(vec3 p) {
   p = unrimPoint(p);
   p.xy-=uSurfaceBend*pow(p.z-.007,2.);
   float d = 100000.0;
   for(int i=0; i<5; i++) {
     if(float(i) >= uLobeCount) break;
     vec4 l = uLobes[i];
     float e = (length(vec3((p.xy-l.xy)/l.z, (p.z-.3968)/.62))-1.0)*min(l.z,.62);
     float h=clamp(.5+.5*(e-d)/uBlend,0.,1.);
     d=mix(e,d,h)-uBlend*h*(1.-h);
   }
   return max(d,.007-p.z);
 }
 vec3 fieldNormal(vec3 p) {
   vec2 e=vec2(.0007,0.);
   return normalize(vec3(field(p+e.xyy)-field(p-e.xyy),field(p+e.yxy)-field(p-e.yxy),field(p+e.yyx)-field(p-e.yyx)));
 }
`;

/** Reuses marching-cube grids instead of allocating one per fusion. */
export class ShapePool {
  private free = new Map<number, FusionShape[]>();
  acquire(radius: number): FusionShape {
    const resolution = shapeResolution(radius);
    return this.free.get(resolution)?.pop() ?? new FusionShape(resolution);
  }
  release(shape: FusionShape) {
    const list = this.free.get(shape.resolution) ?? [];
    if (list.length < 6) { list.push(shape); this.free.set(shape.resolution, list); } else shape.dispose();
  }
  dispose() { for (const list of this.free.values()) for (const shape of list) shape.dispose(); this.free.clear(); }
}
