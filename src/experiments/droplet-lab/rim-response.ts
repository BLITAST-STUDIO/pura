/**
 * Rim ripples: small capillary-like waves that run around the drop's outline.
 * The approved body motion already owns the two-lobed (k=2) squash/stretch;
 * this adds the 3-, 4- and 5-lobed modes on top, excited where something
 * touched the drop, plus a contact anchor that keeps a squashed drop pressed
 * against the wall instead of shrinking away from it.
 * Presentation only: consumes snapshots, never writes to the simulation.
 * Angles are in the rendering plane (+x right, +y up).
 */

export const RIM_MODES = [3, 4, 5] as const;
const BASE_FREQUENCY = Math.PI * 2 * 3.1; // the approved k=2 body rhythm
const BASE_DECAY = 3.4;
// Capillary rim waves: ω² ∝ k(k²−1). Damping grows with k, but gently, so a
// jelly-like drop shivers for a few cycles instead of freezing instantly.
const FREQUENCY = RIM_MODES.map(k => BASE_FREQUENCY * Math.sqrt(k * (k * k - 1) / 6));
const DECAY = RIM_MODES.map(k => BASE_DECAY * k / 2);
/**
 * A dent of this angular half-width distributes over the modes. A broad dent
 * puts most energy in the 3-lobed mode, the most legible within the budget.
 */
const DENT_WIDTH = 0.5;
const WEIGHT = RIM_MODES.map(k => Math.exp(-((k * DENT_WIDTH) ** 2) / 2));
/**
 * Convexity budget: a polar outline r(θ) stays convex while r'' < r + 2r'²/r.
 * Keeping Σ k²|c_k| ≤ .9 guarantees it, so the optical exit search still
 * meets a single surface along every ray.
 */
export const RIM_BUDGET = 0.9;
const MAX_DT = 1 / 12;
const QUIET_SECONDS = 0.1;
const ANCHOR_SECONDS = 0.05;

export type RimInput = {
  vx: number; vy: number; grabbed: boolean;
  /** Simulation coordinates (+y down), as reported by contacts. */
  wallImpulse: { x: number; y: number };
  /** Touched position relative to the body in radius units, +y up. */
  grabPoint?: { x: number; y: number };
};
/** [a3, b3, a4, b4, a5, b5]: r(θ) = 1 + Σ a_k cos kθ + b_k sin kθ. */
export type RimCoefficients = [number, number, number, number, number, number];
export type RimSnapshot = { coefficients: RimCoefficients; anchor: { x: number; y: number; weight: number } };

export class DropletRim {
  private amplitude = new Float64Array(6);
  private velocity = new Float64Array(6);
  private previousGrabbed = false;
  private contactQuiet = Infinity;
  private contactAge = Infinity;
  private contactNormal = { x: 0, y: 0 };

  get snapshot(): RimSnapshot {
    const weight = this.contactAge < 0.3 ? Math.exp(-this.contactAge / ANCHOR_SECONDS) : 0;
    return {
      coefficients: [...this.amplitude] as RimCoefficients,
      anchor: { x: this.contactNormal.x, y: this.contactNormal.y, weight },
    };
  }

  reset(): void {
    this.amplitude.fill(0); this.velocity.fill(0);
    this.previousGrabbed = false;
    this.contactQuiet = this.contactAge = Infinity;
  }

  /**
   * A localized push at `angle`. Positive strength dents inward, negative
   * bulges outward. Delivered as a velocity kick, so the rim moves smoothly.
   */
  excite(angle: number, strength: number): void {
    if (!Number.isFinite(angle) || !Number.isFinite(strength) || strength === 0) return;
    RIM_MODES.forEach((k, i) => {
      const kick = -strength * WEIGHT[i] * FREQUENCY[i];
      this.velocity[i * 2] += kick * Math.cos(k * angle);
      this.velocity[i * 2 + 1] += kick * Math.sin(k * angle);
    });
  }

  update(input: RimInput, dtSeconds: number, reducedMotion = false): RimSnapshot {
    if (reducedMotion) {
      this.reset();
      this.previousGrabbed = input.grabbed;
      return this.snapshot;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return this.snapshot;
    const dt = Math.min(dtSeconds, MAX_DT);

    if (input.grabbed && !this.previousGrabbed && input.grabPoint) {
      const reach = Math.min(1, Math.hypot(input.grabPoint.x, input.grabPoint.y));
      if (reach > 0.15) this.excite(Math.atan2(input.grabPoint.y, input.grabPoint.x), 0.06 * reach);
    }
    const speed = Math.hypot(input.vx, input.vy);
    if (this.previousGrabbed && !input.grabbed && speed > 120) {
      // Letting go: the leading side gives a little, as the body catches up.
      this.excite(Math.atan2(-input.vy, input.vx), Math.min(0.07, speed / 12000));
    }

    const ix = input.wallImpulse.x, iy = -input.wallImpulse.y;
    const push = Math.hypot(ix, iy);
    if (push > 0) {
      // The surface that was hit lies opposite to the push it gave.
      this.contactNormal = { x: -ix / push, y: -iy / push };
      this.contactAge = 0;
      // Holding a drop against a wall reports contact every step: only the
      // first touch after a quiet gap rings the rim; pressing just anchors.
      if (this.contactQuiet >= QUIET_SECONDS && push > 90) {
        this.excite(Math.atan2(this.contactNormal.y, this.contactNormal.x), Math.min(0.15, push / 4500));
      }
      this.contactQuiet = 0;
    } else {
      this.contactQuiet += dt;
      this.contactAge += dt;
    }

    for (let m = 0; m < RIM_MODES.length; m++) {
      const w = FREQUENCY[m], g = DECAY[m];
      const damped = Math.sqrt(w * w - g * g);
      const decay = Math.exp(-g * dt), c = Math.cos(damped * dt), s = Math.sin(damped * dt);
      for (let j = m * 2; j < m * 2 + 2; j++) {
        const x = this.amplitude[j], v = this.velocity[j];
        // Exact underdamped solution, stable at any frame rate (as DropletMotion).
        this.amplitude[j] = decay * (x * c + (v + g * x) / damped * s);
        this.velocity[j] = decay * (v * c - (g * v + w * w * x) / damped * s);
      }
    }
    let budget = 0;
    RIM_MODES.forEach((k, i) => { budget += k * k * Math.hypot(this.amplitude[i * 2], this.amplitude[i * 2 + 1]); });
    if (budget > RIM_BUDGET) {
      const scale = RIM_BUDGET / budget;
      for (let j = 0; j < 6; j++) { this.amplitude[j] *= scale; this.velocity[j] *= scale; }
    }
    this.previousGrabbed = input.grabbed;
    return this.snapshot;
  }
}

/** Express world-angle coefficients in a frame rotated by `angle` (e.g. a rotated mesh). */
export function rotateRim(coefficients: RimCoefficients, angle: number): RimCoefficients {
  const out = [...coefficients] as RimCoefficients;
  RIM_MODES.forEach((k, i) => {
    const a = coefficients[i * 2], b = coefficients[i * 2 + 1];
    const c = Math.cos(k * angle), s = Math.sin(k * angle);
    out[i * 2] = a * c + b * s;
    out[i * 2 + 1] = b * c - a * s;
  });
  return out;
}

/** Radius multiplier and its angular derivative; mirrors RIM_GLSL.rimProfile. */
export function rimProfile(coefficients: RimCoefficients, theta: number): { r: number; dr: number } {
  let r = 1, dr = 0;
  RIM_MODES.forEach((k, i) => {
    const a = coefficients[i * 2], b = coefficients[i * 2 + 1];
    r += a * Math.cos(k * theta) + b * Math.sin(k * theta);
    dr += k * (-a * Math.sin(k * theta) + b * Math.cos(k * theta));
  });
  return { r, dr };
}

/**
 * Offset, in radius units, that keeps the contact side of a squashed drop on
 * the surface it hit. `xx, xy, yy` is the drop's symmetric in-plane scale.
 */
export function contactAnchor(anchor: RimSnapshot['anchor'], xx: number, xy: number, yy: number): { x: number; y: number } {
  if (!(anchor.weight > 0)) return { x: 0, y: 0 };
  const sx = xx * anchor.x + xy * anchor.y, sy = xy * anchor.x + yy * anchor.y;
  const gap = 1 - Math.hypot(sx, sy);
  return { x: anchor.x * gap * anchor.weight, y: anchor.y * gap * anchor.weight };
}

/**
 * GLSL twin of rimProfile plus the inverse map and gradient transform. With
 * uRimActive = 0 every function is the identity, so the approved look is kept.
 */
export const RIM_GLSL = /* glsl */ `
  uniform vec4 uRimA;
  uniform vec2 uRimB;
  uniform float uRimActive;
  vec2 rimProfile(vec2 dir) {
    float c1 = dir.x, s1 = dir.y;
    float c2 = c1 * c1 - s1 * s1, s2 = 2.0 * s1 * c1;
    float c3 = c2 * c1 - s2 * s1, s3 = s2 * c1 + c2 * s1;
    float c4 = c3 * c1 - s3 * s1, s4 = s3 * c1 + c3 * s1;
    float c5 = c4 * c1 - s4 * s1, s5 = s4 * c1 + c4 * s1;
    float r = 1.0 + uRimA.x * c3 + uRimA.y * s3 + uRimA.z * c4 + uRimA.w * s4 + uRimB.x * c5 + uRimB.y * s5;
    float dr = 3.0 * (uRimA.y * c3 - uRimA.x * s3) + 4.0 * (uRimA.w * c4 - uRimA.z * s4)
      + 5.0 * (uRimB.y * c5 - uRimB.x * s5);
    return vec2(r, dr);
  }
  vec3 rimPoint(vec3 p) {
    float rho = length(p.xy);
    if (uRimActive < 0.5 || rho < 1.0e-6) return p;
    return vec3(p.xy * rimProfile(p.xy / rho).x, p.z);
  }
  vec3 unrimPoint(vec3 p) {
    float rho = length(p.xy);
    if (uRimActive < 0.5 || rho < 1.0e-6) return p;
    return vec3(p.xy / rimProfile(p.xy / rho).x, p.z);
  }
  vec2 unrimPlane(vec2 p) {
    float rho = length(p);
    if (uRimActive < 0.5 || rho < 1.0e-6) return p;
    return p / rimProfile(p / rho).x;
  }
  // g is the un-rimmed field's gradient at unrimPoint(p); returns the gradient at p.
  vec3 rimGradient(vec3 p, vec3 g) {
    float rho = length(p.xy);
    if (uRimActive < 0.5 || rho < 1.0e-6) return g;
    vec2 er = p.xy / rho, et = vec2(-er.y, er.x);
    vec2 rr = rimProfile(er);
    float gr = dot(g.xy, er), gt = dot(g.xy, et);
    return vec3(er * gr + et * (gt - gr * rr.y / rr.x), rr.x * g.z);
  }
  float rimExtent() {
    return 1.0 + uRimActive * (length(uRimA.xy) + length(uRimA.zw) + length(uRimB));
  }
`;
