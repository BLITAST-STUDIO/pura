import * as THREE from 'three';

/**
 * A faint spray when a drop gives up a colour: a few tiny beads leave the
 * parent's rim toward the separated drop and fade within half a second.
 * Presentation only; the simulation already placed the new drop.
 * Coordinates are world units on the floor plane (+z up).
 */
export const SPARK_CAPACITY = 96;
export const SPARK_LIFE = 0.45;
const PER_SPLIT = 11;
const DRAG = 7;
const GRAVITY = 2.2;

type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; r: number; g: number; b: number };

export class SplitSparks {
  private sparks: Spark[] = [];
  private seed = 0x2545f491;

  get alive(): number { return this.sparks.length; }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 0) / 4294967296;
  }

  /**
   * From the parent's rim toward the child. `scale` is the parent radius in
   * world units; `color` is the separated colour's transmitted tint.
   */
  burst(from: { x: number; y: number }, to: { x: number; y: number }, scale: number, color: [number, number, number]): void {
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length, ny = dy / length;
    for (let i = 0; i < PER_SPLIT; i++) {
      if (this.sparks.length >= SPARK_CAPACITY) this.sparks.shift();
      const spread = (this.random() - 0.5) * 1.3;
      const c = Math.cos(spread), s = Math.sin(spread);
      const dirX = nx * c - ny * s, dirY = nx * s + ny * c;
      const speed = scale * (2.4 + this.random() * 2.8);
      this.sparks.push({
        x: from.x + nx * scale * 0.9, y: from.y + ny * scale * 0.9, z: scale * (0.25 + this.random() * 0.35),
        vx: dirX * speed, vy: dirY * speed, vz: scale * (0.6 + this.random() * 1.2),
        age: 0, life: SPARK_LIFE * (0.6 + this.random() * 0.4), size: 0.55 + this.random() * 0.6,
        r: color[0], g: color[1], b: color[2],
      });
    }
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    const drag = Math.exp(-DRAG * dt);
    for (const p of this.sparks) {
      p.age += dt;
      p.vx *= drag; p.vy *= drag; p.vz = p.vz * drag - GRAVITY * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0.004, p.z + p.vz * dt);
    }
    this.sparks = this.sparks.filter(p => p.age < p.life);
  }

  clear(): void { this.sparks = []; }

  /** Writes live sparks into the attribute arrays; returns how many to draw. */
  fill(position: Float32Array, color: Float32Array, fade: Float32Array): number {
    this.sparks.forEach((p, i) => {
      position.set([p.x, p.y, p.z], i * 3);
      color.set([p.r, p.g, p.b], i * 3);
      const t = p.age / p.life;
      // Quick appear, soft fade; size is folded into the fade channel's second use.
      fade[i * 2] = Math.min(1, t * 12) * (1 - t) * (1 - t);
      fade[i * 2 + 1] = p.size * (1 - 0.4 * t);
    });
    return this.sparks.length;
  }
}

export function createSparkPoints() {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(SPARK_CAPACITY * 3);
  const color = new Float32Array(SPARK_CAPACITY * 3);
  const fade = new Float32Array(SPARK_CAPACITY * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    name: 'Pura split spray', toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixels: { value: 30 } },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute vec2 fade;
      uniform float uPixels;
      varying vec3 vColor; varying float vFade;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = uPixels * fade.y / max(-view.z, 0.1);
        vColor = color; vFade = fade.x;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vFade;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        // A tiny bead: soft body with a brighter core, tinted by its colour.
        float body = exp(-d * 3.0);
        gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.4 * exp(-d * 10.0)), body * vFade * 0.8);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const sync = (sparks: SplitSparks) => {
    const count = sparks.fill(position, color, fade);
    geometry.setDrawRange(0, count);
    for (const name of ['position', 'color', 'fade']) (geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  };
  return { points, sync, dispose() { geometry.dispose(); material.dispose(); } };
}
