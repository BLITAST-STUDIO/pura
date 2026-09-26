import type { DropletSnapshot } from './simulation';

export type DropletSurfaceInput = Pick<DropletSnapshot, 'x' | 'y' | 'r' | 'pointer' | 'grabbed'> & {
  /** Touched position relative to the body, in radius units with +Y upward. */
  grabPoint?: { x: number; y: number };
};
export type DropletSurfaceSnapshot = { bendX: number; bendY: number; press: number };

export const MAX_SURFACE_BEND = 0.065;
export const MAX_PRESS = 0.028;

const MAX_DT = 1 / 12;
const GAP_DEAD_ZONE = 0.03;
const GAP_GAIN = 0.105;
const ATTACK_SECONDS = 0.018;
const RELEASE_SECONDS = 0.085;
const PRESS_SECONDS = 0.08;
const EDGE_SECONDS = 0.065;
const EDGE_BEND = 0.01;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const bounded = (value: number, min: number, max: number) => Number.isFinite(value) ? clamp(value, min, max) : 0;

/** Keep the established XY wobble while compensating its volume through height. */
export function volumeScales(stretch: number, squash: number, press: number): { x: number; y: number; z: number } {
  const s = bounded(stretch, -0.26, 0.26);
  const q = bounded(squash, 0, 0.25);
  const pressure = Math.sqrt(1 + bounded(press, 0, MAX_PRESS));
  const x = (1 + s) * pressure;
  const y = (1 - s * 0.46 + q) * pressure;
  return { x, y, z: 1 / (x * y) };
}

/**
 * A small, fast surface cue layered over the established body and pull motion.
 * Bend points toward the finger; touch compression and edge cues are single
 * decaying pulses. A held, stationary drop does not keep breathing or bending.
 * The renderer uses bend for a shared geometric/optical height-dependent shear.
 */
export class DropletSurface {
  private bendX = 0;
  private bendY = 0;
  private edgeX = 0;
  private edgeY = 0;
  private press = 0;
  private previousGrabbed = false;

  get snapshot(): DropletSurfaceSnapshot {
    const x = this.bendX + this.edgeX;
    const y = this.bendY + this.edgeY;
    const strength = Math.hypot(x, y);
    const scale = strength > MAX_SURFACE_BEND ? MAX_SURFACE_BEND / strength : 1;
    return { bendX: x * scale, bendY: y * scale, press: this.press };
  }

  reset(): void {
    this.bendX = this.bendY = this.edgeX = this.edgeY = this.press = 0;
    this.previousGrabbed = false;
  }

  update(input: DropletSurfaceInput, dtSeconds: number, reducedMotion = false): DropletSurfaceSnapshot {
    if (reducedMotion) {
      this.reset();
      // Do not replay a touch that happened while surface motion was disabled.
      this.previousGrabbed = input.grabbed;
      return this.snapshot;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return this.snapshot;
    const dt = Math.min(dtSeconds, MAX_DT);

    if (input.grabbed && !this.previousGrabbed) {
      this.press = MAX_PRESS;
      const anchor = input.grabPoint;
      const x = anchor && Number.isFinite(anchor.x) ? anchor.x : 0;
      const y = anchor && Number.isFinite(anchor.y) ? anchor.y : 0;
      const scale = EDGE_BEND / Math.max(1, Math.hypot(x, y));
      this.edgeX = x * scale;
      this.edgeY = y * scale;
    }

    let targetX = 0;
    let targetY = 0;
    if (input.grabbed && input.pointer && Number.isFinite(input.r) && input.r > 0) {
      const gapX = (input.pointer.x - input.x) / input.r;
      const gapY = -(input.pointer.y - input.y) / input.r;
      const gap = Math.hypot(gapX, gapY);
      if (Number.isFinite(gap) && gap > GAP_DEAD_ZONE) {
        const strength = Math.min(MAX_SURFACE_BEND, (gap - GAP_DEAD_ZONE) * GAP_GAIN);
        targetX = gapX / gap * strength;
        targetY = gapY / gap * strength;
      }
    }

    const recovering = targetX === 0 && targetY === 0;
    const follow = -Math.expm1(-dt / (recovering ? RELEASE_SECONDS : ATTACK_SECONDS));
    this.bendX += (targetX - this.bendX) * follow;
    this.bendY += (targetY - this.bendY) * follow;
    this.edgeX *= Math.exp(-dt / EDGE_SECONDS);
    this.edgeY *= Math.exp(-dt / EDGE_SECONDS);
    this.press *= Math.exp(-dt / PRESS_SECONDS);
    this.previousGrabbed = input.grabbed;
    return this.snapshot;
  }
}
