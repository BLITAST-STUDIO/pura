import type { DropletSnapshot } from './simulation';

export type DropletMotionInput = Pick<DropletSnapshot, 'vx' | 'vy' | 'grabbed' | 'wallImpulse'>;
export type DropletMotionSnapshot = { stretch: number; squash: number; angle: number };

const FREQUENCY = Math.PI * 2 * 3.1;
const DECAY = 3.4;
const DAMPED_FREQUENCY = Math.sqrt(FREQUENCY * FREQUENCY - DECAY * DECAY);
const MAX_DT = 1 / 12;
const MAX_STRETCH = 0.26;
const MAX_SQUASH = 0.25;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * A presentation-only shape response. Changes in motion excite a short, damped
 * oscillation; travelling at a constant speed does not hold the drop elongated.
 * This consumes physics snapshots and never writes back to the simulation.
 */
export class DropletMotion {
  private stretch = 0;
  private stretchVelocity = 0;
  private squash = 0;
  private angle = 0;
  private previousVx = 0;
  private previousVy = 0;
  private previousGrabbed = false;

  get snapshot(): DropletMotionSnapshot {
    return { stretch: this.stretch, squash: this.squash, angle: this.angle };
  }

  reset(): void {
    this.stretch = this.stretchVelocity = this.squash = this.angle = 0;
    this.previousVx = this.previousVy = 0;
    this.previousGrabbed = false;
  }

  update(input: DropletMotionInput, dtSeconds: number, reducedMotion = false): DropletMotionSnapshot {
    if (reducedMotion) {
      this.reset();
      // Enabling motion again must not replay the acceleration or release that
      // happened while the user chose to suppress the visual response.
      this.observe(input);
      return this.snapshot;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return this.snapshot;
    const dt = Math.min(dtSeconds, MAX_DT);
    const speed = Math.hypot(input.vx, input.vy);
    const previousSpeed = Math.hypot(this.previousVx, this.previousVy);
    const wall = Math.hypot(input.wallImpulse.x, input.wallImpulse.y);
    const speedChange = speed - previousSpeed;
    const velocityChange = Math.hypot(input.vx - this.previousVx, input.vy - this.previousVy);
    const turnChange = Math.max(0, velocityChange - Math.abs(speedChange));

    // The tiny travelling bias preserves a hint of drag without the old frozen
    // ellipse. Acceleration is applied across the elapsed interval, keeping the
    // response comparable when a frame covers several fixed physics steps.
    const travelBias = Math.min(0.026, speed / 32000);
    const accelerationKick = wall > 0 ? 0 : clamp(speedChange * 0.006 + turnChange * 0.003, -5, 5);
    const target = travelBias + accelerationKick / (FREQUENCY * FREQUENCY * dt);

    if (this.previousGrabbed && !input.grabbed && (speed > 20 || Math.abs(this.stretch) > 0.006)) {
      // Release excites the *shape*, never another throw velocity. The first
      // recovery contracts along travel, then overshoots and rings down.
      this.stretchVelocity -= Math.min(2.7, 0.9 + speed / 650 + Math.abs(this.stretch) * 3);
    }
    if (wall > 0) {
      this.stretchVelocity -= Math.min(5, wall * 0.0045);
      this.squash = Math.min(MAX_SQUASH, this.squash + wall / 7000);
    }
    this.stretchVelocity = clamp(this.stretchVelocity, -7, 7);

    // Exact solution of x'' + 2*DECAY*x' + FREQUENCY²*(x-target) = 0.
    // Unlike a frame-sized Euler step, this remains underdamped at 15 Hz.
    const displacement = this.stretch - target;
    const decay = Math.exp(-DECAY * dt);
    const cosine = Math.cos(DAMPED_FREQUENCY * dt);
    const sine = Math.sin(DAMPED_FREQUENCY * dt);
    const velocity = this.stretchVelocity;
    this.stretch = target + decay * (displacement * cosine + (velocity + DECAY * displacement) / DAMPED_FREQUENCY * sine);
    this.stretchVelocity = decay * (velocity * cosine - (DECAY * velocity + FREQUENCY * FREQUENCY * displacement) / DAMPED_FREQUENCY * sine);
    const boundedStretch = clamp(this.stretch, -MAX_STRETCH, MAX_STRETCH);
    if (boundedStretch !== this.stretch) {
      this.stretch = boundedStretch;
      // Spend excess visual energy at the silhouette envelope, rather than
      // sticking to a clamped ellipse until a large hidden velocity dies away.
      if (this.stretch * this.stretchVelocity > 0) this.stretchVelocity = 0;
    }
    this.squash *= Math.exp(-dt * 9);

    if (speed > 10 || wall > 0) {
      const goal = wall > 0
        ? Math.atan2(-input.wallImpulse.y, input.wallImpulse.x)
        : Math.atan2(-input.vy, input.vx);
      // An ellipse's axis is unchanged by a half turn. Taking the nearest axis
      // avoids rotating a flattened drop 180° every time it bounces or reverses.
      const delta = Math.atan2(Math.sin((goal - this.angle) * 2), Math.cos((goal - this.angle) * 2)) / 2;
      this.angle += delta * (1 - Math.exp(-dt * 15));
    }
    this.observe(input);
    return this.snapshot;
  }

  private observe(input: DropletMotionInput): void {
    this.previousVx = input.vx;
    this.previousVy = input.vy;
    this.previousGrabbed = input.grabbed;
  }
}
