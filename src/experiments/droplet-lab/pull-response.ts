import type { DropletSnapshot } from './simulation';

export type DropletPullInput = Pick<DropletSnapshot, 'x' | 'y' | 'r' | 'pointer' | 'grabbed'>;
/** Rendering-world coordinates: +x right, +y up, in fractions of the radius. */
export type DropletPullSnapshot = { x: number; y: number; strength: number };

const MAX_DT = 1 / 12;
export const MAX_PULL = 0.24;
const DEAD_ZONE = 0.03;
const GAP_GAIN = 0.4;
const FOLLOW_SECONDS = 0.045;
const RECOVER_SECONDS = 0.065;

/**
 * A visual leading-edge response to the finger getting ahead of the body.
 * The existing spring moves the body; this only supplies a bounded surface
 * offset. Catching the finger removes the pull even while still grabbed.
 */
export class DropletPull {
  private x = 0;
  private y = 0;

  get snapshot(): DropletPullSnapshot {
    return { x: this.x, y: this.y, strength: Math.hypot(this.x, this.y) };
  }

  reset(): void {
    this.x = this.y = 0;
  }

  update(input: DropletPullInput, dtSeconds: number, reducedMotion = false): DropletPullSnapshot {
    if (reducedMotion) {
      this.reset();
      return this.snapshot;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return this.snapshot;
    const dt = Math.min(dtSeconds, MAX_DT);
    let targetX = 0;
    let targetY = 0;

    if (input.grabbed && input.pointer && Number.isFinite(input.r) && input.r > 0) {
      const gapX = (input.pointer.x - input.x) / input.r;
      // Simulation coordinates run down the board; the mesh's world Y runs up.
      const gapY = -(input.pointer.y - input.y) / input.r;
      const gap = Math.hypot(gapX, gapY);
      if (Number.isFinite(gap) && gap > DEAD_ZONE) {
        const strength = Math.min(MAX_PULL, (gap - DEAD_ZONE) * GAP_GAIN);
        targetX = gapX / gap * strength;
        targetY = gapY / gap * strength;
      }
    }

    const recovering = targetX === 0 && targetY === 0;
    const response = -Math.expm1(-dt / (recovering ? RECOVER_SECONDS : FOLLOW_SECONDS));
    // Interpolating the vector, not just its length, avoids an instantaneous
    // direction flip. This exact exponential is stable across frame cadences.
    this.x += (targetX - this.x) * response;
    this.y += (targetY - this.y) * response;
    return this.snapshot;
  }
}
