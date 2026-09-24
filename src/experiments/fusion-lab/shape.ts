import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { Absorption } from './composition';

export type Lobe = { x: number; y: number; r: number; absorption: Absorption; amount: number };
export const BOTTOM = .007;
const t = (BOTTOM - .3968) / .62;
export const UNIT_VOLUME = Math.PI * .62 * (2 / 3 - t + t ** 3 / 3);
export function smoothUnion(a: number, b: number, k: number) {
  const h = Math.max(0, Math.min(1, .5 + .5 * (b - a) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}
export function shapeField(x: number, y: number, z: number, lobes: Lobe[], k: number) {
  let distance = 1e5;
  for (const lobe of lobes) {
    const ellipsoid = (Math.hypot((x - lobe.x) / lobe.r, (y - lobe.y) / lobe.r, (z - .3968) / .62) - 1) * Math.min(lobe.r, .62);
    distance = smoothUnion(distance, ellipsoid, k);
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
export class FusionShape {
  private marcher = new MarchingCubes(40, new THREE.MeshBasicMaterial(), false, false, 18000);
  readonly geometry = this.marcher.geometry;
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
      const len = Math.hypot(nx, ny, nz) || 1;
      normal.setXYZ(i, nx / len, ny / len, nz / len);
    }
    this.volume = meshVolume(p, count);
    this.correction = Math.sqrt(UNIT_VOLUME / this.volume);
    p.needsUpdate = normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
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
